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

/** Manual correction. Positive adds stock, negative removes it. */
export class AdjustStockDto {
  @IsMongoId()
  ingredientId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  quantity: number;

  @IsOptional()
  @IsIn(SUPPORTED_UNITS)
  unit?: string;

  @IsString()
  @MaxLength(200)
  reason: string;

  /** Explicit opt-in required before stock may go below zero. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  allowNegative?: boolean = false;
}

export class RecordWastageDto {
  @IsMongoId()
  ingredientId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  quantity: number;

  @IsOptional()
  @IsIn(SUPPORTED_UNITS)
  unit?: string;

  @IsString()
  @MaxLength(200)
  reason: string;
}
