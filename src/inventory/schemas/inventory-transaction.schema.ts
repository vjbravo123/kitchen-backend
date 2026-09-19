import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type InventoryTransactionDocument = HydratedDocument<InventoryTransaction>;

export enum TransactionType {
  PURCHASE = 'PURCHASE',
  PRODUCTION_CONSUMPTION = 'PRODUCTION_CONSUMPTION',
  WASTAGE = 'WASTAGE',
  ADJUSTMENT = 'ADJUSTMENT',
  OPENING_STOCK = 'OPENING_STOCK',
  PRODUCTION_REVERSAL = 'PRODUCTION_REVERSAL',
}

/** Immutable stock ledger. Every quantity is in base units (g / ml / piece). */
@Schema({ timestamps: true })
export class InventoryTransaction {
  @Prop({ type: Types.ObjectId, ref: 'Vendor', required: true, index: true })
  vendor: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Ingredient', required: true, index: true })
  ingredient: Types.ObjectId;

  @Prop({ required: true })
  ingredientName: string;

  @Prop({ type: String, enum: TransactionType, required: true })
  type: TransactionType;

  /** Positive = stock in, negative = stock out. */
  @Prop({ required: true })
  quantity: number;

  @Prop({ required: true })
  baseUnit: string;

  @Prop({ required: true })
  quantityBefore: number;

  @Prop({ required: true })
  quantityAfter: number;

  /** Value of this movement at the cost rate applied at that moment. */
  @Prop({ default: 0 })
  costPerBaseUnit: number;

  @Prop({ default: 0 })
  totalCost: number;

  @Prop({ type: Types.ObjectId, ref: 'Production', default: null, index: true })
  production?: Types.ObjectId | null;

  @Prop()
  reason?: string;
}

export const InventoryTransactionSchema = SchemaFactory.createForClass(InventoryTransaction);

InventoryTransactionSchema.index({ vendor: 1, createdAt: -1 });
InventoryTransactionSchema.index({ vendor: 1, ingredient: 1, createdAt: -1 });
InventoryTransactionSchema.index({ vendor: 1, type: 1, createdAt: -1 });
