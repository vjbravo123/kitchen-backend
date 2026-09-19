import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RecipeDocument = HydratedDocument<Recipe>;

export enum WastageType {
  NONE = 'NONE',
  FIXED = 'FIXED',
  PERCENTAGE = 'PERCENTAGE',
}

export enum WastageBasis {
  /** Percentage applies to ingredient cost only (default, most common). */
  INGREDIENT = 'INGREDIENT',
  /** Percentage applies to ingredient + packaging + labor + utility. */
  SUBTOTAL = 'SUBTOTAL',
}

@Schema({ _id: false })
export class RecipeItem {
  @Prop({ type: Types.ObjectId, ref: 'Ingredient', required: true })
  ingredient: Types.ObjectId;

  /** Quantity as typed by the vendor, in `unit`. */
  @Prop({ required: true, min: 0 })
  quantity: number;

  @Prop({ required: true, lowercase: true, trim: true })
  unit: string;

  /** Same quantity converted to base units - used for all maths. */
  @Prop({ required: true, min: 0 })
  baseQuantity: number;

  @Prop()
  note?: string;
}

export const RecipeItemSchema = SchemaFactory.createForClass(RecipeItem);

/**
 * NOTE ON STORED COSTS: the recipe never stores a computed ingredient/total
 * cost. Costs are derived on demand from the ingredients' current
 * costPerBaseUnit, so a price change is reflected everywhere immediately.
 * Only Production records freeze costs (see production.schema.ts).
 */
@Schema({ timestamps: true })
export class Recipe {
  @Prop({ type: Types.ObjectId, ref: 'Vendor', required: true, index: true })
  vendor: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  /** The batch this recipe is written for, e.g. 1 (kg) or 12 (pieces). */
  @Prop({ required: true, min: 0.0001, default: 1 })
  baseServings: number;

  /** Label only: "kg", "cake", "plate", "box"... */
  @Prop({ default: 'serving', trim: true })
  servingUnit: string;

  @Prop({ type: [RecipeItemSchema], default: [] })
  items: RecipeItem[];

  @Prop({ default: 0, min: 0 })
  packagingCost: number;

  @Prop({ default: 0, min: 0 })
  laborCost: number;

  @Prop({ default: 0, min: 0 })
  utilityCost: number;

  @Prop({ type: String, enum: WastageType, default: WastageType.NONE })
  wastageType: WastageType;

  /** Rupees when FIXED, percent (0-100) when PERCENTAGE. */
  @Prop({ default: 0, min: 0 })
  wastageValue: number;

  @Prop({ type: String, enum: WastageBasis, default: WastageBasis.INGREDIENT })
  wastageBasis: WastageBasis;

  /** Selling price for one base batch. */
  @Prop({ default: 0, min: 0 })
  sellingPrice: number;

  /**
   * When true (default) packaging/labor/utility/selling price scale linearly
   * with the batch size. Set false for costs that stay flat per batch.
   */
  @Prop({ default: true })
  scaleOverheads: boolean;

  @Prop({ default: true })
  isActive: boolean;
}

export const RecipeSchema = SchemaFactory.createForClass(Recipe);

RecipeSchema.index({ vendor: 1, name: 1 }, { unique: true });
RecipeSchema.index({ vendor: 1, isActive: 1 });
RecipeSchema.index({ vendor: 1, 'items.ingredient': 1 });

RecipeSchema.set('toJSON', { virtuals: true });
