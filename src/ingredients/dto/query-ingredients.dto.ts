import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

const toBool = ({ value }: { value: any }) =>
  value === true || value === 'true' ? true : value === false || value === 'false' ? false : undefined;

export class QueryIngredientsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isActive?: boolean;

  /** Only ingredients at or below their minimum stock level. */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  lowStock?: boolean;
}
