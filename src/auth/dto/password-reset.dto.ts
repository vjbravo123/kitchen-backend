import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  @Transform(({ value }) => String(value).toLowerCase().trim())
  email: string;
}

export class ResetPasswordDto {
  @IsEmail()
  @Transform(({ value }) => String(value).toLowerCase().trim())
  email: string;

  @Length(6, 6)
  @Matches(/^\d{6}$/)
  otp: string;

  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'Password must contain at least one letter and one number',
  })
  newPassword: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'Password must contain at least one letter and one number',
  })
  newPassword: string;
}
