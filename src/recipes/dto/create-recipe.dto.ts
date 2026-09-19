import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { RecipeItemDto } from './recipe-item.dto';
import { WastageBasis, WastageType } from '../schemas/recipe.schema';

export class CreateRecipeDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /** Batch size the quantities below are written for, e.g. 1 (kg). */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  baseServings: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  servingUnit?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'A recipe needs at least one ingredient' })
  @ValidateNested({ each: true })
  @Type(() => RecipeItemDto)
  items: RecipeItemDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  packagingCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  laborCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  utilityCost?: number;

  @IsOptional()
  @IsEnum(WastageType)
  wastageType?: WastageType;

  /** Rupees when wastageType=FIXED, percent (0-100) when PERCENTAGE. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  wastageValue?: number;

  @IsOptional()
  @IsEnum(WastageBasis)
  wastageBasis?: WastageBasis;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellingPrice?: number;

  @IsOptional()
  @IsBoolean()
  scaleOverheads?: boolean;
}
