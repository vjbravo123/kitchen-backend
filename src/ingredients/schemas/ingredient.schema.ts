import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { UnitType } from '../../common/utils/unit.util';

export type IngredientDocument = HydratedDocument<Ingredient>;

/**
 * An ingredient is both the catalogue entry and its stock record.
 *
 * Quantities (currentQuantity, minimumStockLevel) are ALWAYS stored in base
 * units (g / ml / piece) so any purchase or recipe unit can be mixed safely.
 *
 * costPerBaseUnit is the single source of truth for costing:
 *   1 kg chocolate for Rs.500  ->  costPerBaseUnit = 500 / 1000 = Rs.0.5 per g
 *   200 g in a recipe          ->  200 * 0.5 = Rs.100
 */
@Schema({ timestamps: true })
export class Ingredient {
  @Prop({ type: Types.ObjectId, ref: 'Vendor', required: true, index: true })
  vendor: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  /** Unit the vendor buys/thinks in, e.g. "kg". */
  @Prop({ required: true, lowercase: true, trim: true })
  unit: string;

  /** Derived from `unit`: WEIGHT | VOLUME | COUNT. */
  @Prop({ type: String, enum: UnitType, required: true })
  unitType: UnitType;

  /** g | ml | piece */
  @Prop({ required: true })
  baseUnit: string;

  /** Stock on hand, in base units. */
  @Prop({ required: true, default: 0, min: 0 })
  currentQuantity: number;

  /** Last purchase: price paid for `purchaseQuantity` `unit`s. */
  @Prop({ required: true, default: 0, min: 0 })
  purchasePrice: number;

  @Prop({ required: true, default: 1, min: 0 })
  purchaseQuantity: number;

  /** purchasePrice / (purchaseQuantity converted to base units). */
  @Prop({ required: true, default: 0, min: 0 })
  costPerBaseUnit: number;

  /** Reorder threshold, in base units. */
  @Prop({ default: 0, min: 0 })
  minimumStockLevel: number;

  @Prop({ trim: true })
  supplier?: string;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastPriceUpdatedAt?: Date;
}

export const IngredientSchema = SchemaFactory.createForClass(Ingredient);

// One ingredient name per vendor; also the main lookup index.
IngredientSchema.index({ vendor: 1, name: 1 }, { unique: true });
IngredientSchema.index({ vendor: 1, isActive: 1 });
IngredientSchema.index({ vendor: 1, currentQuantity: 1 });

IngredientSchema.set('toJSON', { virtuals: true });
