import { Transform } from 'class-transformer';
import { IsEmail, Length, Matches } from 'class-validator';

export class VerifyOtpDto {
  @IsEmail()
  @Transform(({ value }) => String(value).toLowerCase().trim())
  email: string;

  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'OTP must contain digits only' })
  otp: string;
}
