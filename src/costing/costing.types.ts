import { WastageBasis, WastageType } from '../recipes/schemas/recipe.schema';

export interface CostLine {
  ingredientId: string;
  name: string;
  /** Quantity written in the recipe for one base batch. */
  recipeQuantity: number;
  recipeUnit: string;
  /** Quantity actually needed for the requested servings, in base units. */
  requiredQuantity: number;
  baseUnit: string;
  costPerBaseUnit: number;
  lineCost: number;
  availableQuantity: number;
  shortage: number;
  isSufficient: boolean;
}

export interface CostBreakdown {
  recipeId: string;
  recipeName: string;
  baseServings: number;
  servings: number;
  servingUnit: string;
  scaleFactor: number;
  scaleOverheads: boolean;

  lines: CostLine[];

  ingredientCost: number;
  packagingCost: number;
  laborCost: number;
  utilityCost: number;
  wastageCost: number;
  wastage: { type: WastageType; value: number; basis: WastageBasis };

  totalCost: number;
  costPerServing: number;

  sellingPrice: number;
  sellingPricePerServing: number;
  profit: number;
  profitPerServing: number;
  profitMarginPercent: number;
  markupPercent: number;
  breakEvenPrice: number;

  canProduce: boolean;
  missingIngredients: string[];
  /** Highest number of servings the current stock supports. */
  maxProducibleServings: number;

  pricedAt: string;
}
