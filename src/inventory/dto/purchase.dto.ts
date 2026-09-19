import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { SUPPORTED_UNITS } from '../../common/utils/unit.util';

export class PurchaseStockDto {
  @IsMongoId()
  ingredientId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  quantity: number;

  @IsOptional()
  @IsIn(SUPPORTED_UNITS)
  unit?: string;

  /** Total amount paid for this purchase. Used to refresh the rate. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  totalCost?: number;

  /**
   * When true (default) and totalCost is given, the ingredient rate is updated
   * to this purchase's rate and a price-history entry is written.
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  updatePrice?: boolean = true;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
