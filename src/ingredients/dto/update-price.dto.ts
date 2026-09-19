import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsPositive, IsString, MaxLength, Min } from 'class-validator';
import { SUPPORTED_UNITS } from '../../common/utils/unit.util';

/** Changes the ingredient rate only - stock is untouched. */
export class UpdatePriceDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  purchasePrice: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  purchaseQuantity?: number;

  @IsOptional()
  @IsIn(SUPPORTED_UNITS)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
