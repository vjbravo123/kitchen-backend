import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PriceHistoryDocument = HydratedDocument<PriceHistory>;

export enum PriceChangeSource {
  CREATE = 'CREATE',
  MANUAL_UPDATE = 'MANUAL_UPDATE',
  PURCHASE = 'PURCHASE',
}

/** Append-only log so past costing records can still be explained. */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class PriceHistory {
  @Prop({ type: Types.ObjectId, ref: 'Vendor', required: true, index: true })
  vendor: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Ingredient', required: true, index: true })
  ingredient: Types.ObjectId;

  @Prop({ required: true })
  ingredientName: string;

  @Prop({ required: true })
  unit: string;

  @Prop({ required: true })
  purchasePrice: number;

  @Prop({ required: true })
  purchaseQuantity: number;

  @Prop({ required: true })
  costPerBaseUnit: number;

  @Prop({ default: null })
  previousCostPerBaseUnit: number | null;

  @Prop({ type: String, enum: PriceChangeSource, required: true })
  source: PriceChangeSource;

  @Prop()
  note?: string;
}

export const PriceHistorySchema = SchemaFactory.createForClass(PriceHistory);
PriceHistorySchema.index({ vendor: 1, ingredient: 1, createdAt: -1 });
