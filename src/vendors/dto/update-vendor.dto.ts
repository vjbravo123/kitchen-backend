import { IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class UpdateVendorDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  businessName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3, { message: 'currency must be a 3 letter code, e.g. INR' })
  currency?: string;
}
