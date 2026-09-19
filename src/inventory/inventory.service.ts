import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  InventoryTransaction,
  InventoryTransactionDocument,
  TransactionType,
} from './schemas/inventory-transaction.schema';
import { Ingredient, IngredientDocument } from '../ingredients/schemas/ingredient.schema';
import {
  PriceChangeSource,
  PriceHistory,
  PriceHistoryDocument,
} from '../ingredients/schemas/price-history.schema';
import { IngredientsService } from '../ingredients/ingredients.service';
import { PurchaseStockDto } from './dto/purchase.dto';
import { AdjustStockDto, RecordWastageDto } from './dto/adjust.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { buildPaginated } from '../common/dto/pagination.dto';
import { D, divide, toMoney, toQuantity } from '../common/utils/money.util';
import { assertCompatibleUnits, normalizeUnit, toBaseQuantity } from '../common/utils/unit.util';

export interface ConsumptionLine {
  ingredientId: string;
  /** Quantity in base units. */
  baseQuantity: number;
  costPerBaseUnit: number;
  ingredientName: string;
  baseUnit: string;
}

@Injectable()
export class InventoryService {
  constructor(
    @InjectModel(InventoryTransaction.name)
    private readonly txModel: Model<InventoryTransaction>,
    @InjectModel(Ingredient.name) private readonly ingredientModel: Model<Ingredient>,
    @InjectModel(PriceHistory.name) private readonly priceHistoryModel: Model<PriceHistory>,
    private readonly ingredientsService: IngredientsService,
  ) {}

  /** Stock in: increases quantity and optionally refreshes the cost rate. */
  async purchase(vendorId: string, dto: PurchaseStockDto) {
    const ingredient = await this.ingredientsService.findOne(vendorId, dto.ingredientId);
    const unit = dto.unit ? normalizeUnit(dto.unit) : ingredient.unit;
    if (dto.unit) assertCompatibleUnits(ingredient.unit, unit);

    const baseQuantity = toQuantity(toBaseQuantity(dto.quantity, unit));
    const quantityBefore = ingredient.currentQuantity;

    let costPerBaseUnit = ingredient.costPerBaseUnit;
    let priceUpdated = false;

    if (dto.totalCost !== undefined && dto.updatePrice !== false) {
      const previous = ingredient.costPerBaseUnit;
      costPerBaseUnit = D(divide(dto.totalCost, baseQuantity)).toDecimalPlaces(6).toNumber();

      ingredient.purchasePrice = toMoney(dto.totalCost);
      ingredient.purchaseQuantity = toQuantity(dto.quantity);
      ingredient.unit = unit;
      ingredient.costPerBaseUnit = costPerBaseUnit;
      ingredient.lastPriceUpdatedAt = new Date();
      priceUpdated = true;

      await this.priceHistoryModel.create({
        vendor: ingredient.vendor,
        ingredient: ingredient._id,
        ingredientName: ingredient.name,
        unit,
        purchasePrice: ingredient.purchasePrice,
        purchaseQuantity: ingredient.purchaseQuantity,
        costPerBaseUnit,
        previousCostPerBaseUnit: previous,
        source: PriceChangeSource.PURCHASE,
        note: dto.note,
      });
    }

    ingredient.currentQuantity = toQuantity(D(quantityBefore).plus(baseQuantity));
    await ingredient.save();

    const transaction = await this.txModel.create({
      vendor: ingredient.vendor,
      ingredient: ingredient._id,
      ingredientName: ingredient.name,
      type: TransactionType.PURCHASE,
      quantity: baseQuantity,
      baseUnit: ingredient.baseUnit,
      quantityBefore,
      quantityAfter: ingredient.currentQuantity,
      costPerBaseUnit,
      totalCost: toMoney(dto.totalCost ?? D(baseQuantity).times(costPerBaseUnit)),
      reason: dto.note || 'Stock purchase',
    });

    return {
      ingredient: this.ingredientsService.decorate(ingredient.toObject()),
      transaction,
      priceUpdated,
    };
  }

  /** Manual correction in either direction. */
  async adjust(vendorId: string, dto: AdjustStockDto) {
    const ingredient = await this.ingredientsService.findOne(vendorId, dto.ingredientId);
    const unit = dto.unit ? normalizeUnit(dto.unit) : ingredient.unit;
    if (dto.unit) assertCompatibleUnits(ingredient.unit, unit);
    if (dto.quantity === 0) throw new BadRequestException('quantity cannot be zero');

    const delta = toQuantity(toBaseQuantity(dto.quantity, unit));
    const quantityBefore = ingredient.currentQuantity;
    const after = D(quantityBefore).plus(delta);

    if (after.lessThan(0) && !dto.allowNegative) {
      throw new BadRequestException(
        `Insufficient stock for "${ingredient.name}": available ${quantityBefore} ${ingredient.baseUnit}, ` +
          `requested ${Math.abs(delta)} ${ingredient.baseUnit}. Pass allowNegative=true to override.`,
      );
    }

    ingredient.currentQuantity = toQuantity(after);
    await ingredient.save();

    const transaction = await this.txModel.create({
      vendor: ingredient.vendor,
      ingredient: ingredient._id,
      ingredientName: ingredient.name,
      type: TransactionType.ADJUSTMENT,
      quantity: delta,
      baseUnit: ingredient.baseUnit,
      quantityBefore,
      quantityAfter: ingredient.currentQuantity,
      costPerBaseUnit: ingredient.costPerBaseUnit,
      totalCost: toMoney(D(delta).times(ingredient.costPerBaseUnit)),
      reason: dto.reason,
    });

    return { ingredient: this.ingredientsService.decorate(ingredient.toObject()), transaction };
  }

  async recordWastage(vendorId: string, dto: RecordWastageDto) {
    const ingredient = await this.ingredientsService.findOne(vendorId, dto.ingredientId);
    const unit = dto.unit ? normalizeUnit(dto.unit) : ingredient.unit;
    if (dto.unit) assertCompatibleUnits(ingredient.unit, unit);

    const baseQuantity = toQuantity(toBaseQuantity(dto.quantity, unit));
    if (D(ingredient.currentQuantity).lessThan(baseQuantity)) {
      throw new BadRequestException(
        `Cannot record wastage of ${baseQuantity} ${ingredient.baseUnit}: only ` +
          `${ingredient.currentQuantity} ${ingredient.baseUnit} in stock`,
      );
    }

    const quantityBefore = ingredient.currentQuantity;
    ingredient.currentQuantity = toQuantity(D(quantityBefore).minus(baseQuantity));
    await ingredient.save();

    const transaction = await this.txModel.create({
      vendor: ingredient.vendor,
      ingredient: ingredient._id,
      ingredientName: ingredient.name,
      type: TransactionType.WASTAGE,
      quantity: -baseQuantity,
      baseUnit: ingredient.baseUnit,
      quantityBefore,
      quantityAfter: ingredient.currentQuantity,
      costPerBaseUnit: ingredient.costPerBaseUnit,
      totalCost: toMoney(D(baseQuantity).times(ingredient.costPerBaseUnit)),
      reason: dto.reason,
    });

    return { ingredient: this.ingredientsService.decorate(ingredient.toObject()), transaction };
  }

  /**
   * Atomically deducts several ingredients for a production run.
   *
   * The conditional update ({ currentQuantity: { $gte: qty } }) makes each
   * deduction race-safe even without a replica set; when a session is supplied
   * the whole run additionally commits or rolls back as one transaction.
   */
  async consumeForProduction(
    vendorId: string,
    lines: ConsumptionLine[],
    productionId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<void> {
    const vendor = new Types.ObjectId(vendorId);

    for (const line of lines) {
      if (line.baseQuantity <= 0) continue;

      const updated = await this.ingredientModel.findOneAndUpdate(
        {
          _id: new Types.ObjectId(line.ingredientId),
          vendor,
          currentQuantity: { $gte: line.baseQuantity },
        },
        { $inc: { currentQuantity: -line.baseQuantity } },
        { new: true, session },
      );

      if (!updated) {
        const current = await this.ingredientModel
          .findOne({ _id: new Types.ObjectId(line.ingredientId), vendor })
          .session(session || null);
        throw new BadRequestException(
          `Insufficient stock for "${line.ingredientName}": required ${line.baseQuantity} ` +
            `${line.baseUnit}, available ${current?.currentQuantity ?? 0} ${line.baseUnit}`,
        );
      }

      // Guard against tiny float drift accumulating in the stored quantity.
      const normalized = toQuantity(updated.currentQuantity);
      if (normalized !== updated.currentQuantity) {
        await this.ingredientModel.updateOne(
          { _id: updated._id },
          { $set: { currentQuantity: normalized } },
          { session },
        );
      }

      await this.txModel.create(
        [
          {
            vendor,
            ingredient: updated._id,
            ingredientName: line.ingredientName,
            type: TransactionType.PRODUCTION_CONSUMPTION,
            quantity: -line.baseQuantity,
            baseUnit: line.baseUnit,
            quantityBefore: toQuantity(D(normalized).plus(line.baseQuantity)),
            quantityAfter: normalized,
            costPerBaseUnit: line.costPerBaseUnit,
            totalCost: toMoney(D(line.baseQuantity).times(line.costPerBaseUnit)),
            production: productionId,
            reason: 'Production consumption',
          },
        ],
        { session },
      );
    }
  }

  /** Puts stock back when a production record is cancelled. */
  async restoreFromProduction(
    vendorId: string,
    lines: ConsumptionLine[],
    productionId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<void> {
    const vendor = new Types.ObjectId(vendorId);

    for (const line of lines) {
      if (line.baseQuantity <= 0) continue;

      const updated = await this.ingredientModel.findOneAndUpdate(
        { _id: new Types.ObjectId(line.ingredientId), vendor },
        { $inc: { currentQuantity: line.baseQuantity } },
        { new: true, session },
      );
      if (!updated) continue;

      await this.txModel.create(
        [
          {
            vendor,
            ingredient: updated._id,
            ingredientName: line.ingredientName,
            type: TransactionType.PRODUCTION_REVERSAL,
            quantity: line.baseQuantity,
            baseUnit: line.baseUnit,
            quantityBefore: toQuantity(D(updated.currentQuantity).minus(line.baseQuantity)),
            quantityAfter: toQuantity(updated.currentQuantity),
            costPerBaseUnit: line.costPerBaseUnit,
            totalCost: toMoney(D(line.baseQuantity).times(line.costPerBaseUnit)),
            production: productionId,
            reason: 'Production cancelled',
          },
        ],
        { session },
      );
    }
  }

  async transactions(vendorId: string, query: QueryTransactionsDto) {
    const filter: Record<string, any> = { vendor: new Types.ObjectId(vendorId) };
    if (query.ingredientId) filter.ingredient = new Types.ObjectId(query.ingredientId);
    if (query.type) filter.type = query.type;
    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) filter.createdAt.$gte = new Date(query.from);
      if (query.to) filter.createdAt.$lte = new Date(query.to);
    }

    const [items, total] = await Promise.all([
      this.txModel
        .find(filter)
        .sort({ [query.sortBy || 'createdAt']: query.sortOrder === 'asc' ? 1 : -1 })
        .skip(query.skip)
        .limit(query.limit)
        .lean(),
      this.txModel.countDocuments(filter),
    ]);

    return buildPaginated(items, total, query);
  }

  async lowStock(vendorId: string) {
    const items = await this.ingredientModel
      .find({
        vendor: new Types.ObjectId(vendorId),
        isActive: true,
        $expr: { $lte: ['$currentQuantity', '$minimumStockLevel'] },
      })
      .sort({ name: 1 })
      .lean();
    return items.map((i) => this.ingredientsService.decorate(i));
  }

  /** Total value of stock on hand at current rates. */
  async valuation(vendorId: string) {
    const items = await this.ingredientModel
      .find({ vendor: new Types.ObjectId(vendorId), isActive: true })
      .lean();

    let total = D(0);
    const breakdown = items.map((i) => {
      const value = D(i.currentQuantity).times(i.costPerBaseUnit);
      total = total.plus(value);
      return {
        ingredientId: i._id,
        name: i.name,
        currentQuantity: toQuantity(i.currentQuantity),
        baseUnit: i.baseUnit,
        costPerBaseUnit: i.costPerBaseUnit,
        stockValue: toMoney(value),
        isLowStock: D(i.currentQuantity).lessThanOrEqualTo(i.minimumStockLevel),
      };
    });

    return { totalStockValue: toMoney(total), ingredientCount: items.length, breakdown };
  }
}
