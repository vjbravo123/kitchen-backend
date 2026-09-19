import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Ingredient, IngredientDocument } from './schemas/ingredient.schema';
import {
  PriceChangeSource,
  PriceHistory,
  PriceHistoryDocument,
} from './schemas/price-history.schema';
import { Recipe, RecipeDocument } from '../recipes/schemas/recipe.schema';
import {
  InventoryTransaction,
  InventoryTransactionDocument,
  TransactionType,
} from '../inventory/schemas/inventory-transaction.schema';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';
import { UpdatePriceDto } from './dto/update-price.dto';
import { QueryIngredientsDto } from './dto/query-ingredients.dto';
import { buildPaginated, PaginatedResult } from '../common/dto/pagination.dto';
import { D, divide, toMoney, toQuantity } from '../common/utils/money.util';
import {
  assertCompatibleUnits,
  getBaseUnit,
  getUnitType,
  normalizeUnit,
  toBaseQuantity,
} from '../common/utils/unit.util';

@Injectable()
export class IngredientsService {
  constructor(
    @InjectModel(Ingredient.name) private readonly ingredientModel: Model<Ingredient>,
    @InjectModel(PriceHistory.name) private readonly priceHistoryModel: Model<PriceHistory>,
    @InjectModel(Recipe.name) private readonly recipeModel: Model<Recipe>,
    @InjectModel(InventoryTransaction.name)
    private readonly txModel: Model<InventoryTransaction>,
  ) {}

  /** cost per base unit = price / quantity converted to base units. */
  private computeCostPerBaseUnit(price: number, quantity: number, unit: string): number {
    const baseQty = toBaseQuantity(quantity, unit);
    if (baseQty.lessThanOrEqualTo(0)) {
      throw new BadRequestException('purchaseQuantity must be greater than zero');
    }
    // Kept at 6 decimals: Rs.0.5/g style rates must not be rounded to 2.
    return D(divide(price, baseQty)).toDecimalPlaces(6).toNumber();
  }

  async create(vendorId: string, dto: CreateIngredientDto): Promise<IngredientDocument> {
    const unit = normalizeUnit(dto.unit);
    const unitType = getUnitType(unit);
    const baseUnit = getBaseUnit(unit);

    const duplicate = await this.ingredientModel.findOne({
      vendor: new Types.ObjectId(vendorId),
      name: new RegExp(`^${escapeRegex(dto.name.trim())}$`, 'i'),
    });
    if (duplicate) throw new ConflictException(`Ingredient "${dto.name}" already exists`);

    if (dto.openingQuantityUnit) assertCompatibleUnits(unit, dto.openingQuantityUnit);
    if (dto.minimumStockUnit) assertCompatibleUnits(unit, dto.minimumStockUnit);

    const costPerBaseUnit = this.computeCostPerBaseUnit(dto.purchasePrice, dto.purchaseQuantity, unit);
    const openingQuantity = dto.openingQuantity
      ? toQuantity(toBaseQuantity(dto.openingQuantity, dto.openingQuantityUnit || unit))
      : 0;
    const minimumStockLevel = dto.minimumStockLevel
      ? toQuantity(toBaseQuantity(dto.minimumStockLevel, dto.minimumStockUnit || unit))
      : 0;

    const ingredient = await this.ingredientModel.create({
      vendor: new Types.ObjectId(vendorId),
      name: dto.name.trim(),
      unit,
      unitType,
      baseUnit,
      currentQuantity: openingQuantity,
      purchasePrice: toMoney(dto.purchasePrice),
      purchaseQuantity: toQuantity(dto.purchaseQuantity),
      costPerBaseUnit,
      minimumStockLevel,
      supplier: dto.supplier,
      notes: dto.notes,
      lastPriceUpdatedAt: new Date(),
    });

    await this.priceHistoryModel.create({
      vendor: ingredient.vendor,
      ingredient: ingredient._id,
      ingredientName: ingredient.name,
      unit,
      purchasePrice: ingredient.purchasePrice,
      purchaseQuantity: ingredient.purchaseQuantity,
      costPerBaseUnit,
      previousCostPerBaseUnit: null,
      source: PriceChangeSource.CREATE,
    });

    if (openingQuantity > 0) {
      await this.txModel.create({
        vendor: ingredient.vendor,
        ingredient: ingredient._id,
        ingredientName: ingredient.name,
        type: TransactionType.OPENING_STOCK,
        quantity: openingQuantity,
        baseUnit,
        quantityBefore: 0,
        quantityAfter: openingQuantity,
        costPerBaseUnit,
        totalCost: toMoney(D(openingQuantity).times(costPerBaseUnit)),
        reason: 'Opening stock',
      });
    }

    return ingredient;
  }

  async findAll(vendorId: string, query: QueryIngredientsDto): Promise<PaginatedResult<any>> {
    const filter: Record<string, any> = { vendor: new Types.ObjectId(vendorId) };
    if (query.search) filter.name = new RegExp(escapeRegex(query.search), 'i');
    if (query.isActive !== undefined) filter.isActive = query.isActive;
    if (query.lowStock) filter.$expr = { $lte: ['$currentQuantity', '$minimumStockLevel'] };

    const [items, total] = await Promise.all([
      this.ingredientModel
        .find(filter)
        .sort({ [query.sortBy || 'createdAt']: query.sortOrder === 'asc' ? 1 : -1 })
        .skip(query.skip)
        .limit(query.limit)
        .lean(),
      this.ingredientModel.countDocuments(filter),
    ]);

    return buildPaginated(items.map((i) => this.decorate(i)), total, query);
  }

  /** Every read is scoped by vendor - this is the cross-vendor isolation rule. */
  async findOne(vendorId: string, id: string): Promise<IngredientDocument> {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid ingredient id');
    const ingredient = await this.ingredientModel.findOne({
      _id: new Types.ObjectId(id),
      vendor: new Types.ObjectId(vendorId),
    });
    if (!ingredient) throw new NotFoundException('Ingredient not found');
    return ingredient;
  }

  async findManyByIds(vendorId: string, ids: (string | Types.ObjectId | any)[], session?: ClientSession) {
    const objectIds = ids.map((id) => {
      const raw = (id as any)?._id ?? id;
      return new Types.ObjectId(raw.toString());
    });
    const query = this.ingredientModel.find({
      _id: { $in: objectIds },
      vendor: new Types.ObjectId(vendorId),
    });
    if (session) query.session(session);
    const docs = await query.exec();
    const map = new Map<string, IngredientDocument>();
    docs.forEach((d) => map.set(d._id.toString(), d));
    return map;
  }

  async update(vendorId: string, id: string, dto: UpdateIngredientDto): Promise<IngredientDocument> {
    const ingredient = await this.findOne(vendorId, id);

    if (dto.name && dto.name.trim().toLowerCase() !== ingredient.name.toLowerCase()) {
      const duplicate = await this.ingredientModel.findOne({
        vendor: ingredient.vendor,
        _id: { $ne: ingredient._id },
        name: new RegExp(`^${escapeRegex(dto.name.trim())}$`, 'i'),
      });
      if (duplicate) throw new ConflictException(`Ingredient "${dto.name}" already exists`);
      ingredient.name = dto.name.trim();
    }

    if (dto.unit) {
      const unit = normalizeUnit(dto.unit);
      // Changing family would invalidate stock and every recipe line.
      assertCompatibleUnits(ingredient.unit, unit);
      ingredient.unit = unit;
    }

    if (dto.minimumStockLevel !== undefined) {
      if (dto.minimumStockUnit) assertCompatibleUnits(ingredient.unit, dto.minimumStockUnit);
      ingredient.minimumStockLevel = toQuantity(
        toBaseQuantity(dto.minimumStockLevel, dto.minimumStockUnit || ingredient.unit),
      );
    }

    if (dto.supplier !== undefined) ingredient.supplier = dto.supplier;
    if (dto.notes !== undefined) ingredient.notes = dto.notes;
    if (dto.isActive !== undefined) ingredient.isActive = dto.isActive;

    await ingredient.save();
    return ingredient;
  }

  /**
   * Updates the rate only. Because recipes never store a cached cost, every
   * recipe using this ingredient immediately reflects the new price.
   */
  async updatePrice(vendorId: string, id: string, dto: UpdatePriceDto) {
    const ingredient = await this.findOne(vendorId, id);
    const unit = dto.unit ? normalizeUnit(dto.unit) : ingredient.unit;
    if (dto.unit) assertCompatibleUnits(ingredient.unit, unit);

    const purchaseQuantity = dto.purchaseQuantity ?? ingredient.purchaseQuantity;
    const previous = ingredient.costPerBaseUnit;
    const costPerBaseUnit = this.computeCostPerBaseUnit(dto.purchasePrice, purchaseQuantity, unit);

    ingredient.unit = unit;
    ingredient.purchasePrice = toMoney(dto.purchasePrice);
    ingredient.purchaseQuantity = toQuantity(purchaseQuantity);
    ingredient.costPerBaseUnit = costPerBaseUnit;
    ingredient.lastPriceUpdatedAt = new Date();
    await ingredient.save();

    await this.priceHistoryModel.create({
      vendor: ingredient.vendor,
      ingredient: ingredient._id,
      ingredientName: ingredient.name,
      unit,
      purchasePrice: ingredient.purchasePrice,
      purchaseQuantity: ingredient.purchaseQuantity,
      costPerBaseUnit,
      previousCostPerBaseUnit: previous,
      source: PriceChangeSource.MANUAL_UPDATE,
      note: dto.note,
    });

    const affectedRecipes = await this.recipeModel.countDocuments({
      vendor: ingredient.vendor,
      'items.ingredient': ingredient._id,
    });

    return {
      ingredient: this.decorate(ingredient.toObject()),
      previousCostPerBaseUnit: previous,
      newCostPerBaseUnit: costPerBaseUnit,
      affectedRecipes,
    };
  }

  async priceHistory(vendorId: string, id: string) {
    const ingredient = await this.findOne(vendorId, id);
    return this.priceHistoryModel
      .find({ vendor: ingredient.vendor, ingredient: ingredient._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
  }

  /** Soft delete; refuses while the ingredient is still used by a recipe. */
  async remove(vendorId: string, id: string, force = false) {
    const ingredient = await this.findOne(vendorId, id);

    const usedBy = await this.recipeModel
      .find({ vendor: ingredient.vendor, 'items.ingredient': ingredient._id, isActive: true })
      .select('name')
      .lean();

    if (usedBy.length && !force) {
      throw new ConflictException(
        `Ingredient is used by ${usedBy.length} recipe(s): ${usedBy.map((r) => r.name).join(', ')}. ` +
          'Remove it from those recipes first, or pass ?force=true to archive it anyway.',
      );
    }

    ingredient.isActive = false;
    await ingredient.save();
    return { archived: true, usedByRecipes: usedBy.map((r) => r.name) };
  }

  /** Adds derived, display-friendly fields without storing them. */
  decorate(ingredient: any) {
    const costPerUnit = D(ingredient.costPerBaseUnit).times(
      toBaseQuantity(1, ingredient.unit),
    );
    return {
      ...ingredient,
      isLowStock: D(ingredient.currentQuantity).lessThanOrEqualTo(ingredient.minimumStockLevel),
      stockValue: toMoney(D(ingredient.currentQuantity).times(ingredient.costPerBaseUnit)),
      costPerPurchaseUnit: toMoney(costPerUnit),
      currentQuantityInUnit: toQuantity(
        divide(ingredient.currentQuantity, toBaseQuantity(1, ingredient.unit)),
      ),
    };
  }
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
