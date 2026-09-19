import { IsDateString, IsEnum, IsMongoId, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { TransactionType } from '../schemas/inventory-transaction.schema';

export class QueryTransactionsDto extends PaginationDto {
  @IsOptional()
  @IsMongoId()
  ingredientId?: string;

  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
