import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';

export class ResendOtpDto {
  @IsEmail()
  @Transform(({ value }) => String(value).toLowerCase().trim())
  email: string;
}
