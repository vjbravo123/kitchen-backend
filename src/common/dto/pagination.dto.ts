import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  get skip(): number {
    return ((this.page || 1) - 1) * (this.limit || 20);
  }
}

export interface PaginatedResult<T> {
  items: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export function buildPaginated<T>(items: T[], total: number, dto: PaginationDto): PaginatedResult<T> {
  const limit = dto.limit || 20;
  return {
    items,
    meta: {
      total,
      page: dto.page || 1,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    },
  };
}
