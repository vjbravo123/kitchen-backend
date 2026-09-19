import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { WastageType } from '../../recipes/schemas/recipe.schema';

export type ProductionDocument = HydratedDocument<Production>;

export enum ProductionStatus {
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/** Frozen snapshot of one ingredient line at the moment of production. */
@Schema({ _id: false })
export class ProductionItem {
  @Prop({ type: Types.ObjectId, ref: 'Ingredient', required: true })
  ingredient: Types.ObjectId;

  @Prop({ required: true })
  ingredientName: string;

  @Prop({ required: true })
  quantity: number; // base units consumed

  @Prop({ required: true })
  baseUnit: string;

  @Prop({ required: true })
  costPerBaseUnit: number;

  @Prop({ required: true })
  lineCost: number;
}
export const ProductionItemSchema = SchemaFactory.createForClass(ProductionItem);

/**
 * A production/sale record. Everything here is a historical snapshot and must
 * NEVER be recalculated when ingredient prices change later.
 */
@Schema({ timestamps: true })
export class Production {
  @Prop({ type: Types.ObjectId, ref: 'Vendor', required: true, index: true })
  vendor: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Recipe', required: true, index: true })
  recipe: Types.ObjectId;

  @Prop({ required: true })
  recipeName: string;

  @Prop({ required: true })
  servings: number;

  @Prop({ required: true })
  baseServings: number;

  @Prop({ required: true })
  scaleFactor: number;

  @Prop({ type: [ProductionItemSchema], default: [] })
  items: ProductionItem[];

  @Prop({ required: true })
  ingredientCost: number;

  @Prop({ required: true })
  packagingCost: number;

  @Prop({ required: true })
  laborCost: number;

  @Prop({ required: true })
  utilityCost: number;

  @Prop({ required: true })
  wastageCost: number;

  @Prop({ type: String, enum: WastageType, default: WastageType.NONE })
  wastageType: WastageType;

  @Prop({ default: 0 })
  wastageValue: number;

  @Prop({ required: true })
  totalCost: number;

  @Prop({ required: true })
  costPerServing: number;

  @Prop({ required: true, default: 0 })
  sellingPrice: number;

  @Prop({ required: true, default: 0 })
  profit: number;

  @Prop({ required: true, default: 0 })
  profitMarginPercent: number;

  @Prop({ type: String, enum: ProductionStatus, default: ProductionStatus.COMPLETED })
  status: ProductionStatus;

  @Prop()
  notes?: string;

  @Prop({ required: true, default: Date.now })
  preparedAt: Date;

  @Prop({ default: null })
  cancelledAt?: Date | null;
}

export const ProductionSchema = SchemaFactory.createForClass(Production);

ProductionSchema.index({ vendor: 1, preparedAt: -1 });
ProductionSchema.index({ vendor: 1, recipe: 1, preparedAt: -1 });
ProductionSchema.index({ vendor: 1, status: 1 });

ProductionSchema.set('toJSON', { virtuals: true });
