import { IsDateString, IsEnum, IsMongoId, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ProductionStatus } from '../schemas/production.schema';

export class QueryProductionDto extends PaginationDto {
  @IsOptional()
  @IsMongoId()
  recipeId?: string;

  @IsOptional()
  @IsEnum(ProductionStatus)
  status?: ProductionStatus;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
