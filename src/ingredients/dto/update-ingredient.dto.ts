import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { SUPPORTED_UNITS } from '../../common/utils/unit.util';

/**
 * Stock quantity is intentionally NOT editable here - use the inventory
 * endpoints so every movement is recorded in the ledger.
 */
export class UpdateIngredientDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  /** Only a unit of the same family is allowed (kg <-> g, not kg <-> ltr). */
  @IsOptional()
  @IsIn(SUPPORTED_UNITS)
  unit?: string;

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

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
