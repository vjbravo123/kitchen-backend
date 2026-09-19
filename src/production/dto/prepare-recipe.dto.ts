import { Type } from 'class-transformer';
import {
  IsDateString,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class PrepareRecipeDto {
  /** Servings/quantity to produce, in the recipe's serving unit. */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  servings: number;

  /**
   * Total selling price for this batch. Optional - when omitted the recipe's
   * selling price scaled to this batch is used. Costs are ALWAYS computed by
   * the backend; only the price may be supplied.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellingPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;

  @IsOptional()
  @IsDateString()
  preparedAt?: string;
}

/** Same payload plus the recipe id, for POST /production. */
export class CreateProductionDto extends PrepareRecipeDto {
  @IsMongoId()
  recipeId: string;
}
