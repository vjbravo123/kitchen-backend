import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsPositive, IsString, MaxLength, Min } from 'class-validator';
import { SUPPORTED_UNITS } from '../../common/utils/unit.util';

export class CreateIngredientDto {
  @IsString()
  @MaxLength(80)
  name: string;

  /** The unit the vendor buys in, e.g. "kg". */
  @IsIn(SUPPORTED_UNITS, { message: `unit must be one of: ${SUPPORTED_UNITS.join(', ')}` })
  unit: string;

  /** Amount paid for `purchaseQuantity` units, e.g. 500 for 1 kg. */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  purchasePrice: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  purchaseQuantity: number;

  /** Stock already on hand, expressed in `unit` (or `openingQuantityUnit`). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  openingQuantity?: number;

  @IsOptional()
  @IsIn(SUPPORTED_UNITS)
  openingQuantityUnit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  minimumStockLevel?: number;

  @IsOptional()
  @IsIn(SUPPORTED_UNITS)
  minimumStockUnit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
