import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @Transform(({ value }) => String(value).toLowerCase().trim())
  email: string;

  @IsString()
  @MinLength(1)
  password: string;
}
