import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Recipe, RecipeDocument, RecipeItem } from './schemas/recipe.schema';
import { IngredientsService, escapeRegex } from '../ingredients/ingredients.service';
import { CostingService } from '../costing/costing.service';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { UpdateRecipeDto } from './dto/update-recipe.dto';
import { RecipeItemDto } from './dto/recipe-item.dto';
import { QueryRecipesDto } from './dto/query-recipes.dto';
import { ScaleRecipeDto } from './dto/scale-recipe.dto';
import { buildPaginated } from '../common/dto/pagination.dto';
import { D, toQuantity } from '../common/utils/money.util';
import { assertCompatibleUnits, normalizeUnit, toBaseQuantity } from '../common/utils/unit.util';

@Injectable()
export class RecipesService {
  constructor(
    @InjectModel(Recipe.name) private readonly recipeModel: Model<Recipe>,
    private readonly ingredientsService: IngredientsService,
    private readonly costingService: CostingService,
  ) {}

  /**
   * Validates that every referenced ingredient belongs to this vendor, that the
   * unit family matches, and converts each line to base units.
   */
  private async buildItems(vendorId: string, items: RecipeItemDto[]): Promise<RecipeItem[]> {
    if (!items?.length) throw new BadRequestException('A recipe needs at least one ingredient');

    const ids = items.map((i) => i.ingredientId);
    const unique = new Set(ids);
    if (unique.size !== ids.length) {
      throw new BadRequestException('The same ingredient is listed more than once');
    }

    const map = await this.ingredientsService.findManyByIds(vendorId, ids);

    return items.map((item) => {
      const ingredient = map.get(item.ingredientId);
      if (!ingredient) {
        throw new NotFoundException(`Ingredient ${item.ingredientId} not found for this vendor`);
      }
      if (!ingredient.isActive) {
        throw new BadRequestException(`Ingredient "${ingredient.name}" is archived`);
      }

      const unit = normalizeUnit(item.unit);
      assertCompatibleUnits(ingredient.unit, unit);

      return {
        ingredient: ingredient._id,
        quantity: toQuantity(item.quantity),
        unit,
        baseQuantity: toQuantity(toBaseQuantity(item.quantity, unit)),
        note: item.note,
      } as RecipeItem;
    });
  }

  async create(vendorId: string, dto: CreateRecipeDto): Promise<RecipeDocument> {
    const duplicate = await this.recipeModel.findOne({
      vendor: new Types.ObjectId(vendorId),
      name: new RegExp(`^${escapeRegex(dto.name.trim())}$`, 'i'),
    });
    if (duplicate) throw new ConflictException(`Recipe "${dto.name}" already exists`);

    const items = await this.buildItems(vendorId, dto.items);

    return this.recipeModel.create({
      vendor: new Types.ObjectId(vendorId),
      name: dto.name.trim(),
      description: dto.description,
      baseServings: dto.baseServings,
      servingUnit: dto.servingUnit || 'serving',
      items,
      packagingCost: dto.packagingCost ?? 0,
      laborCost: dto.laborCost ?? 0,
      utilityCost: dto.utilityCost ?? 0,
      wastageType: dto.wastageType,
      wastageValue: dto.wastageValue ?? 0,
      wastageBasis: dto.wastageBasis,
      sellingPrice: dto.sellingPrice ?? 0,
      scaleOverheads: dto.scaleOverheads ?? true,
    });
  }

  async findAll(vendorId: string, query: QueryRecipesDto) {
    const filter: Record<string, any> = { vendor: new Types.ObjectId(vendorId) };
    if (query.search) filter.name = new RegExp(escapeRegex(query.search), 'i');
    if (query.isActive !== undefined) filter.isActive = query.isActive;
    if (query.ingredientId) filter['items.ingredient'] = new Types.ObjectId(query.ingredientId);

    const [docs, total] = await Promise.all([
      this.recipeModel
        .find(filter)
        .populate('items.ingredient', 'name unit baseUnit costPerBaseUnit currentQuantity')
        .sort({ [query.sortBy || 'createdAt']: query.sortOrder === 'asc' ? 1 : -1 })
        .skip(query.skip)
        .limit(query.limit),
      this.recipeModel.countDocuments(filter),
    ]);

    let items: any[] = docs.map((d) => d.toObject());

    if (query.withCost) {
      items = await Promise.all(
        docs.map(async (doc) => {
          const breakdown = await this.costingService.costRecipeDocument(vendorId, doc);
          return {
            ...doc.toObject(),
            cost: {
              totalCost: breakdown.totalCost,
              costPerServing: breakdown.costPerServing,
              sellingPrice: breakdown.sellingPrice,
              profit: breakdown.profit,
              profitMarginPercent: breakdown.profitMarginPercent,
              canProduce: breakdown.canProduce,
            },
          };
        }),
      );
    }

    return buildPaginated(items, total, query);
  }

  async findOne(vendorId: string, id: string): Promise<RecipeDocument> {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid recipe id');
    const recipe = await this.recipeModel
      .findOne({ _id: new Types.ObjectId(id), vendor: new Types.ObjectId(vendorId) })
      .populate('items.ingredient', 'name unit baseUnit costPerBaseUnit currentQuantity isActive');
    if (!recipe) throw new NotFoundException('Recipe not found');
    return recipe;
  }

  async update(vendorId: string, id: string, dto: UpdateRecipeDto): Promise<RecipeDocument> {
    const recipe = await this.costingService.getRecipeOrThrow(vendorId, id);

    if (dto.name && dto.name.trim().toLowerCase() !== recipe.name.toLowerCase()) {
      const duplicate = await this.recipeModel.findOne({
        vendor: recipe.vendor,
        _id: { $ne: recipe._id },
        name: new RegExp(`^${escapeRegex(dto.name.trim())}$`, 'i'),
      });
      if (duplicate) throw new ConflictException(`Recipe "${dto.name}" already exists`);
      recipe.name = dto.name.trim();
    }

    if (dto.items) recipe.items = await this.buildItems(vendorId, dto.items);

    const assignable: (keyof UpdateRecipeDto)[] = [
      'description',
      'baseServings',
      'servingUnit',
      'packagingCost',
      'laborCost',
      'utilityCost',
      'wastageType',
      'wastageValue',
      'wastageBasis',
      'sellingPrice',
      'scaleOverheads',
      'isActive',
    ];
    assignable.forEach((key) => {
      if (dto[key] !== undefined) (recipe as any)[key] = dto[key];
    });

    await recipe.save();
    return this.findOne(vendorId, id);
  }

  async remove(vendorId: string, id: string) {
    const recipe = await this.costingService.getRecipeOrThrow(vendorId, id);
    recipe.isActive = false;
    await recipe.save();
    return { archived: true };
  }

  /* ----------------------------- recipe items ---------------------------- */

  async addItem(vendorId: string, recipeId: string, dto: RecipeItemDto) {
    const recipe = await this.costingService.getRecipeOrThrow(vendorId, recipeId);
    if (recipe.items.some((i) => i.ingredient.toString() === dto.ingredientId)) {
      throw new ConflictException('This ingredient is already in the recipe. Update it instead.');
    }
    const [item] = await this.buildItems(vendorId, [dto]);
    recipe.items.push(item);
    await recipe.save();
    return this.findOne(vendorId, recipeId);
  }

  async updateItem(
    vendorId: string,
    recipeId: string,
    ingredientId: string,
    dto: Omit<RecipeItemDto, 'ingredientId'>,
  ) {
    const recipe = await this.costingService.getRecipeOrThrow(vendorId, recipeId);
    const index = recipe.items.findIndex((i) => i.ingredient.toString() === ingredientId);
    if (index === -1) throw new NotFoundException('Ingredient is not part of this recipe');

    const [item] = await this.buildItems(vendorId, [{ ...dto, ingredientId }]);
    recipe.items[index] = item;
    await recipe.save();
    return this.findOne(vendorId, recipeId);
  }

  async removeItem(vendorId: string, recipeId: string, ingredientId: string) {
    const recipe = await this.costingService.getRecipeOrThrow(vendorId, recipeId);
    const before = recipe.items.length;
    recipe.items = recipe.items.filter((i) => i.ingredient.toString() !== ingredientId);
    if (recipe.items.length === before) {
      throw new NotFoundException('Ingredient is not part of this recipe');
    }
    if (!recipe.items.length) {
      throw new BadRequestException('A recipe must keep at least one ingredient');
    }
    await recipe.save();
    return this.findOne(vendorId, recipeId);
  }

  /* -------------------------------- scaling ------------------------------- */

  /**
   * Returns scaled quantities plus the full cost breakdown WITHOUT touching the
   * stored recipe. 1 kg cake -> 2 kg doubles every ingredient line.
   */
  async scale(vendorId: string, recipeId: string, dto: ScaleRecipeDto) {
    const recipe = await this.costingService.getRecipeOrThrow(vendorId, recipeId);
    const breakdown = await this.costingService.costRecipeDocument(vendorId, recipe, {
      servings: dto.servings,
      sellingPrice: dto.sellingPrice,
    });

    const scaledIngredients = breakdown.lines.map((line) => {
      const item = recipe.items.find((i) => i.ingredient.toString() === line.ingredientId);
      return {
        ingredientId: line.ingredientId,
        name: line.name,
        originalQuantity: line.recipeQuantity,
        scaledQuantity: toQuantity(D(item.quantity).times(breakdown.scaleFactor)),
        unit: line.recipeUnit,
        requiredBaseQuantity: line.requiredQuantity,
        baseUnit: line.baseUnit,
        lineCost: line.lineCost,
        availableQuantity: line.availableQuantity,
        isSufficient: line.isSufficient,
        shortage: line.shortage,
      };
    });

    return {
      recipeId: recipe._id.toString(),
      recipeName: recipe.name,
      baseServings: recipe.baseServings,
      requestedServings: dto.servings,
      servingUnit: recipe.servingUnit,
      scaleFactor: breakdown.scaleFactor,
      ingredients: scaledIngredients,
      cost: breakdown,
      note: 'This is a preview. The stored recipe has not been modified.',
    };
  }

  /** Can this batch be produced right now? */
  async availability(vendorId: string, recipeId: string, servings?: number) {
    const breakdown = await this.costingService.costRecipe(vendorId, recipeId, { servings });
    return {
      recipeId: breakdown.recipeId,
      servings: breakdown.servings,
      canProduce: breakdown.canProduce,
      missingIngredients: breakdown.missingIngredients,
      maxProducibleServings: breakdown.maxProducibleServings,
      lines: breakdown.lines.map((l) => ({
        name: l.name,
        required: l.requiredQuantity,
        available: l.availableQuantity,
        baseUnit: l.baseUnit,
        shortage: l.shortage,
        isSufficient: l.isSufficient,
      })),
    };
  }
}
