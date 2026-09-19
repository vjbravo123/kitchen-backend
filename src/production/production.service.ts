import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { Production, ProductionDocument, ProductionStatus } from './schemas/production.schema';
import { CostingService } from '../costing/costing.service';
import { InventoryService, ConsumptionLine } from '../inventory/inventory.service';
import { PrepareRecipeDto } from './dto/prepare-recipe.dto';
import { QueryProductionDto } from './dto/query-production.dto';
import { buildPaginated } from '../common/dto/pagination.dto';
import { D, divide, toMoney, toPercent } from '../common/utils/money.util';

@Injectable()
export class ProductionService {
  private readonly logger = new Logger(ProductionService.name);

  constructor(
    @InjectModel(Production.name) private readonly productionModel: Model<Production>,
    @InjectConnection() private readonly connection: Connection,
    private readonly costingService: CostingService,
    private readonly inventoryService: InventoryService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Runs `work` inside a MongoDB transaction when the deployment supports one
   * (replica set / Atlas). On a standalone server the same work runs without a
   * session, so local development still functions.
   */
  private async withTransaction<T>(work: (session?: ClientSession) => Promise<T>): Promise<T> {
    if (!this.config.get<boolean>('database.useTransactions')) {
      return work(undefined);
    }

    const session = await this.connection.startSession();
    try {
      let result: T;
      await session.withTransaction(async () => {
        result = await work(session);
      });
      return result;
    } catch (err: any) {
      const unsupported =
        err?.code === 20 ||
        /Transaction numbers are only allowed on a replica set|replica set|sharded cluster/i.test(
          err?.message || '',
        );
      if (unsupported) {
        this.logger.warn(
          'MongoDB transactions are not available on this deployment - falling back to a ' +
            'non-transactional write. Set USE_TRANSACTIONS=false to silence this warning.',
        );
        return work(undefined);
      }
      throw err;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Produce/sell a batch.
   *
   * 1. scale the recipe          2. cost it at CURRENT prices
   * 3. check stock               4. deduct stock (atomic)
   * 5. save a frozen snapshot    6. return cost / price / profit / margin
   *
   * The saved record never changes when ingredient prices move later.
   */
  async prepare(vendorId: string, recipeId: string, dto: PrepareRecipeDto) {
    const recipe = await this.costingService.getRecipeOrThrow(vendorId, recipeId);
    if (!recipe.isActive) throw new BadRequestException('This recipe is archived');

    const breakdown = await this.costingService.costRecipeDocument(vendorId, recipe, {
      servings: dto.servings,
      sellingPrice: dto.sellingPrice,
    });

    if (!breakdown.canProduce) {
      throw new BadRequestException(
        `Insufficient stock for: ${breakdown.missingIngredients.join(', ')}. ` +
          `Maximum producible right now: ${breakdown.maxProducibleServings} ${recipe.servingUnit}(s).`,
      );
    }

    const productionId = new Types.ObjectId();

    const lines: ConsumptionLine[] = breakdown.lines.map((l) => ({
      ingredientId: l.ingredientId,
      ingredientName: l.name,
      baseQuantity: l.requiredQuantity,
      costPerBaseUnit: l.costPerBaseUnit,
      baseUnit: l.baseUnit,
    }));

    return this.withTransaction(async (session) => {
      await this.inventoryService.consumeForProduction(vendorId, lines, productionId, session);

      const [production] = await this.productionModel.create(
        [
          {
            _id: productionId,
            vendor: new Types.ObjectId(vendorId),
            recipe: recipe._id,
            recipeName: recipe.name,
            servings: breakdown.servings,
            baseServings: breakdown.baseServings,
            scaleFactor: breakdown.scaleFactor,
            items: breakdown.lines.map((l) => ({
              ingredient: new Types.ObjectId(l.ingredientId),
              ingredientName: l.name,
              quantity: l.requiredQuantity,
              baseUnit: l.baseUnit,
              costPerBaseUnit: l.costPerBaseUnit,
              lineCost: l.lineCost,
            })),
            ingredientCost: breakdown.ingredientCost,
            packagingCost: breakdown.packagingCost,
            laborCost: breakdown.laborCost,
            utilityCost: breakdown.utilityCost,
            wastageCost: breakdown.wastageCost,
            wastageType: recipe.wastageType,
            wastageValue: recipe.wastageValue,
            totalCost: breakdown.totalCost,
            costPerServing: breakdown.costPerServing,
            sellingPrice: breakdown.sellingPrice,
            profit: breakdown.profit,
            profitMarginPercent: breakdown.profitMarginPercent,
            status: ProductionStatus.COMPLETED,
            notes: dto.notes,
            preparedAt: dto.preparedAt ? new Date(dto.preparedAt) : new Date(),
          },
        ],
        { session },
      );

      return { production, costBreakdown: breakdown };
    });
  }

  async findAll(vendorId: string, query: QueryProductionDto) {
    const filter: Record<string, any> = { vendor: new Types.ObjectId(vendorId) };
    if (query.recipeId) filter.recipe = new Types.ObjectId(query.recipeId);
    if (query.status) filter.status = query.status;
    if (query.from || query.to) {
      filter.preparedAt = {};
      if (query.from) filter.preparedAt.$gte = new Date(query.from);
      if (query.to) filter.preparedAt.$lte = new Date(query.to);
    }

    const [items, total] = await Promise.all([
      this.productionModel
        .find(filter)
        .sort({ [query.sortBy === 'createdAt' ? 'preparedAt' : query.sortBy]: query.sortOrder === 'asc' ? 1 : -1 })
        .skip(query.skip)
        .limit(query.limit)
        .lean(),
      this.productionModel.countDocuments(filter),
    ]);

    return buildPaginated(items, total, query);
  }

  async findOne(vendorId: string, id: string): Promise<ProductionDocument> {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid production id');
    const production = await this.productionModel.findOne({
      _id: new Types.ObjectId(id),
      vendor: new Types.ObjectId(vendorId),
    });
    if (!production) throw new NotFoundException('Production record not found');
    return production;
  }

  /** Reverses a production run: restores stock and marks the record cancelled. */
  async cancel(vendorId: string, id: string) {
    const production = await this.findOne(vendorId, id);
    if (production.status === ProductionStatus.CANCELLED) {
      throw new BadRequestException('This production record is already cancelled');
    }

    const lines: ConsumptionLine[] = production.items.map((i) => ({
      ingredientId: i.ingredient.toString(),
      ingredientName: i.ingredientName,
      baseQuantity: i.quantity,
      costPerBaseUnit: i.costPerBaseUnit,
      baseUnit: i.baseUnit,
    }));

    return this.withTransaction(async (session) => {
      await this.inventoryService.restoreFromProduction(vendorId, lines, production._id, session);
      // The historical cost figures stay exactly as they were.
      production.status = ProductionStatus.CANCELLED;
      production.cancelledAt = new Date();
      await production.save({ session });
      return production;
    });
  }

  /** Aggregate cost / revenue / profit over a period. */
  async summary(vendorId: string, from?: string, to?: string) {
    const match: Record<string, any> = {
      vendor: new Types.ObjectId(vendorId),
      status: ProductionStatus.COMPLETED,
    };
    if (from || to) {
      match.preparedAt = {};
      if (from) match.preparedAt.$gte = new Date(from);
      if (to) match.preparedAt.$lte = new Date(to);
    }

    const [totals] = await this.productionModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          batches: { $sum: 1 },
          totalCost: { $sum: '$totalCost' },
          totalRevenue: { $sum: '$sellingPrice' },
          totalProfit: { $sum: '$profit' },
        },
      },
    ]);

    const byRecipe = await this.productionModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$recipe',
          recipeName: { $first: '$recipeName' },
          batches: { $sum: 1 },
          servings: { $sum: '$servings' },
          totalCost: { $sum: '$totalCost' },
          totalRevenue: { $sum: '$sellingPrice' },
          totalProfit: { $sum: '$profit' },
        },
      },
      { $sort: { totalProfit: -1 } },
    ]);

    const revenue = D(totals?.totalRevenue ?? 0);
    const profit = D(totals?.totalProfit ?? 0);

    return {
      period: { from: from ?? null, to: to ?? null },
      batches: totals?.batches ?? 0,
      totalCost: toMoney(totals?.totalCost ?? 0),
      totalRevenue: toMoney(revenue),
      totalProfit: toMoney(profit),
      averageMarginPercent: revenue.isZero() ? 0 : toPercent(divide(profit, revenue).times(100)),
      byRecipe: byRecipe.map((r) => ({
        recipeId: r._id,
        recipeName: r.recipeName,
        batches: r.batches,
        servings: r.servings,
        totalCost: toMoney(r.totalCost),
        totalRevenue: toMoney(r.totalRevenue),
        totalProfit: toMoney(r.totalProfit),
        marginPercent: D(r.totalRevenue).isZero()
          ? 0
          : toPercent(divide(r.totalProfit, r.totalRevenue).times(100)),
      })),
    };
  }
}
