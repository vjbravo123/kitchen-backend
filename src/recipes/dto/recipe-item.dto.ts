import { Type } from 'class-transformer';
import { IsIn, IsMongoId, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { SUPPORTED_UNITS } from '../../common/utils/unit.util';

export class RecipeItemDto {
  @IsMongoId({ message: 'ingredientId must be a valid ingredient id' })
  ingredientId: string;

  /** Quantity for ONE base batch of the recipe. */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  quantity: number;

  @IsIn(SUPPORTED_UNITS, { message: `unit must be one of: ${SUPPORTED_UNITS.join(', ')}` })
  unit: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
