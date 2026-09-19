import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Recipe, RecipeDocument, WastageBasis, WastageType } from '../recipes/schemas/recipe.schema';
import { IngredientDocument } from '../ingredients/schemas/ingredient.schema';
import { IngredientsService } from '../ingredients/ingredients.service';
import { D, Decimal, divide, toMoney, toPercent, toQuantity } from '../common/utils/money.util';
import { CostBreakdown, CostLine } from './costing.types';

export interface CostOptions {
  /** Servings to cost. Defaults to the recipe's base servings. */
  servings?: number;
  /** Overrides the recipe selling price for this calculation only. */
  sellingPrice?: number;
}

/**
 * The single costing engine. Every cost number in the API comes from here, so
 * the frontend can never submit its own totals.
 *
 * Formulae
 *   scaleFactor        = servings / baseServings
 *   lineCost           = recipeBaseQuantity * scaleFactor * ingredient.costPerBaseUnit
 *   ingredientCost     = sum(lineCost)
 *   overheads          = (packaging + labor + utility) * (scaleOverheads ? scaleFactor : 1)
 *   wastageCost        = NONE       -> 0
 *                        FIXED      -> value * (scaleOverheads ? scaleFactor : 1)
 *                        PERCENTAGE -> value% of (ingredientCost)            [basis INGREDIENT]
 *                                   -> value% of (ingredientCost + overheads) [basis SUBTOTAL]
 *   totalCost          = ingredientCost + packaging + labor + utility + wastage
 *   profit             = sellingPrice - totalCost
 *   profitMargin (%)   = profit / sellingPrice * 100
 *   markup (%)         = profit / totalCost * 100
 */
@Injectable()
export class CostingService {
  constructor(
    @InjectModel(Recipe.name) private readonly recipeModel: Model<Recipe>,
    private readonly ingredientsService: IngredientsService,
  ) {}

  /** Loads a vendor-owned recipe or throws. */
  async getRecipeOrThrow(vendorId: string, recipeId: string): Promise<RecipeDocument> {
    if (!Types.ObjectId.isValid(recipeId)) throw new BadRequestException('Invalid recipe id');
    const recipe = await this.recipeModel.findOne({
      _id: new Types.ObjectId(recipeId),
      vendor: new Types.ObjectId(vendorId),
    });
    if (!recipe) throw new NotFoundException('Recipe not found');
    return recipe;
  }

  /** Convenience: load recipe + its ingredients, then cost it. */
  async costRecipe(vendorId: string, recipeId: string, options: CostOptions = {}): Promise<CostBreakdown> {
    const recipe = await this.getRecipeOrThrow(vendorId, recipeId);
    return this.costRecipeDocument(vendorId, recipe, options);
  }

  async costRecipeDocument(
    vendorId: string,
    recipe: RecipeDocument,
    options: CostOptions = {},
  ): Promise<CostBreakdown> {
    const ingredientMap = await this.ingredientsService.findManyByIds(
      vendorId,
      recipe.items.map((i) => i.ingredient),
    );
    return this.calculate(recipe, ingredientMap, options);
  }

  /**
   * Pure calculation - no I/O. Given a recipe and the current ingredient
   * documents it produces the full breakdown for `servings`.
   */
  calculate(
    recipe: Recipe & { _id?: any },
    ingredientMap: Map<string, IngredientDocument>,
    options: CostOptions = {},
  ): CostBreakdown {
    const baseServings = D(recipe.baseServings);
    if (baseServings.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Recipe baseServings must be greater than zero');
    }

    const servings = D(options.servings ?? recipe.baseServings);
    if (servings.lessThanOrEqualTo(0)) {
      throw new BadRequestException('servings must be greater than zero');
    }

    const scaleFactor = divide(servings, baseServings);
    const overheadFactor = recipe.scaleOverheads ? scaleFactor : D(1);

    const lines: CostLine[] = [];
    let ingredientCost = D(0);
    const missing: string[] = [];
    let maxServingsRatio: Decimal | null = null;

    for (const item of recipe.items) {
      const rawId = (item.ingredient as any)?._id ?? item.ingredient;
      const ingredient = ingredientMap.get(rawId.toString());
      if (!ingredient) {
        throw new BadRequestException(
          'This recipe references an ingredient that no longer exists. Please update the recipe.',
        );
      }

      const required = D(item.baseQuantity).times(scaleFactor);
      const lineCost = required.times(ingredient.costPerBaseUnit);
      ingredientCost = ingredientCost.plus(lineCost);

      const available = D(ingredient.currentQuantity);
      const shortage = required.minus(available);
      const isSufficient = shortage.lessThanOrEqualTo(0);
      if (!isSufficient) missing.push(ingredient.name);

      // How many base batches could this single ingredient support?
      if (D(item.baseQuantity).greaterThan(0)) {
        const ratio = divide(available, item.baseQuantity);
        maxServingsRatio = maxServingsRatio === null ? ratio : Decimal.min(maxServingsRatio, ratio);
      }

      lines.push({
        ingredientId: ingredient._id.toString(),
        name: ingredient.name,
        recipeQuantity: toQuantity(item.quantity),
        recipeUnit: item.unit,
        requiredQuantity: toQuantity(required),
        baseUnit: ingredient.baseUnit,
        costPerBaseUnit: ingredient.costPerBaseUnit,
        lineCost: toMoney(lineCost),
        availableQuantity: toQuantity(available),
        shortage: isSufficient ? 0 : toQuantity(shortage),
        isSufficient,
      });
    }

    const packagingCost = D(recipe.packagingCost).times(overheadFactor);
    const laborCost = D(recipe.laborCost).times(overheadFactor);
    const utilityCost = D(recipe.utilityCost).times(overheadFactor);

    const wastageCost = this.calculateWastage(
      recipe,
      ingredientCost,
      packagingCost.plus(laborCost).plus(utilityCost),
      overheadFactor,
    );

    const totalCost = ingredientCost
      .plus(packagingCost)
      .plus(laborCost)
      .plus(utilityCost)
      .plus(wastageCost);

    const sellingPrice =
      options.sellingPrice !== undefined
        ? D(options.sellingPrice)
        : D(recipe.sellingPrice).times(overheadFactor);

    const profit = sellingPrice.minus(totalCost);

    // Round once, at the end, so intermediate precision is never lost.
    const totalCostRounded = toMoney(totalCost);
    const sellingPriceRounded = toMoney(sellingPrice);
    const profitRounded = toMoney(profit);

    return {
      recipeId: recipe._id?.toString(),
      recipeName: recipe.name,
      baseServings: toQuantity(baseServings),
      servings: toQuantity(servings),
      servingUnit: recipe.servingUnit,
      scaleFactor: D(scaleFactor).toDecimalPlaces(6).toNumber(),
      scaleOverheads: recipe.scaleOverheads,

      lines,

      ingredientCost: toMoney(ingredientCost),
      packagingCost: toMoney(packagingCost),
      laborCost: toMoney(laborCost),
      utilityCost: toMoney(utilityCost),
      wastageCost: toMoney(wastageCost),
      wastage: {
        type: recipe.wastageType,
        value: recipe.wastageValue,
        basis: recipe.wastageBasis,
      },

      totalCost: totalCostRounded,
      costPerServing: toMoney(divide(totalCost, servings)),

      sellingPrice: sellingPriceRounded,
      sellingPricePerServing: toMoney(divide(sellingPrice, servings)),
      profit: profitRounded,
      profitPerServing: toMoney(divide(profit, servings)),
      profitMarginPercent: sellingPrice.isZero()
        ? 0
        : toPercent(divide(profit, sellingPrice).times(100)),
      markupPercent: totalCost.isZero() ? 0 : toPercent(divide(profit, totalCost).times(100)),
      breakEvenPrice: totalCostRounded,

      canProduce: missing.length === 0,
      missingIngredients: missing,
      maxProducibleServings:
        maxServingsRatio === null ? 0 : toQuantity(maxServingsRatio.times(baseServings)),

      pricedAt: new Date().toISOString(),
    };
  }

  private calculateWastage(
    recipe: Recipe,
    ingredientCost: Decimal,
    overheads: Decimal,
    overheadFactor: Decimal,
  ): Decimal {
    switch (recipe.wastageType) {
      case WastageType.FIXED:
        return D(recipe.wastageValue).times(overheadFactor);
      case WastageType.PERCENTAGE: {
        const basis =
          recipe.wastageBasis === WastageBasis.SUBTOTAL
            ? ingredientCost.plus(overheads)
            : ingredientCost;
        return basis.times(D(recipe.wastageValue).dividedBy(100));
      }
      default:
        return D(0);
    }
  }

  /**
   * Price that achieves a target margin:
   *   price = totalCost / (1 - margin/100)
   */
  async suggestPrice(
    vendorId: string,
    recipeId: string,
    targetMarginPercent: number,
    servings?: number,
  ) {
    if (targetMarginPercent >= 100 || targetMarginPercent < 0) {
      throw new BadRequestException('targetMarginPercent must be between 0 and 99.99');
    }

    const breakdown = await this.costRecipe(vendorId, recipeId, { servings });
    const suggested = divide(breakdown.totalCost, D(1).minus(D(targetMarginPercent).dividedBy(100)));

    return {
      recipeId: breakdown.recipeId,
      recipeName: breakdown.recipeName,
      servings: breakdown.servings,
      totalCost: breakdown.totalCost,
      targetMarginPercent: toPercent(targetMarginPercent),
      suggestedSellingPrice: toMoney(suggested),
      suggestedPricePerServing: toMoney(divide(suggested, breakdown.servings)),
      currentSellingPrice: breakdown.sellingPrice,
      currentMarginPercent: breakdown.profitMarginPercent,
    };
  }
}
