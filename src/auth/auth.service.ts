import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { VendorsService } from '../vendors/vendors.service';
import { MailService } from '../mail/mail.service';
import { OtpService } from './otp.service';
import { OtpPurpose } from './schemas/otp.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly vendorsService: VendorsService,
    private readonly otpService: OtpService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  private signToken(vendorId: string, email: string) {
    return {
      accessToken: this.jwtService.sign({ sub: vendorId, email }),
      expiresIn: this.config.get<string>('jwt.expiresIn'),
      tokenType: 'Bearer',
    };
  }

  /**
   * Registers a vendor and emails a 6 digit OTP.
   * If an unverified account already exists, it is refreshed instead of
   * failing - this lets someone who never verified simply try again.
   */
  async register(dto: RegisterDto) {
    const existing = await this.vendorsService.findByEmail(dto.email);

    if (existing && existing.isEmailVerified) {
      throw new ConflictException('An account with this email already exists');
    }

    let vendor = existing;
    const password = await this.vendorsService.hashPassword(dto.password);

    if (vendor) {
      vendor.name = dto.name;
      vendor.password = password;
      vendor.businessName = dto.businessName ?? vendor.businessName;
      vendor.phone = dto.phone ?? vendor.phone;
      await vendor.save();
    } else {
      vendor = await this.vendorsService.create({
        name: dto.name,
        email: dto.email,
        password,
        businessName: dto.businessName,
        phone: dto.phone,
        isEmailVerified: false,
      });
    }

    const code = await this.otpService.issue(vendor._id, vendor.email, OtpPurpose.EMAIL_VERIFICATION);
    await this.mailService.sendOtpEmail(vendor.email, vendor.name, code, this.otpService.expiryMinutes);

    return {
      message: 'Registration successful. Please verify the OTP sent to your email.',
      data: {
        vendorId: vendor._id.toString(),
        email: vendor.email,
        otpExpiresInMinutes: this.otpService.expiryMinutes,
      },
    };
  }

  /** Verifies the email OTP, activates the account and returns a JWT. */
  async verifyOtp(dto: VerifyOtpDto) {
    const vendor = await this.vendorsService.findByEmail(dto.email);
    if (!vendor) throw new NotFoundException('No account found for this email');

    if (vendor.isEmailVerified) {
      throw new BadRequestException('Email is already verified. Please log in.');
    }

    await this.otpService.verify(dto.email, dto.otp, OtpPurpose.EMAIL_VERIFICATION);

    vendor.isEmailVerified = true;
    vendor.isActive = true;
    await vendor.save();

    return {
      message: 'Email verified successfully',
      data: { vendor, ...this.signToken(vendor._id.toString(), vendor.email) },
    };
  }

  async resendOtp(dto: ResendOtpDto) {
    const vendor = await this.vendorsService.findByEmail(dto.email);
    if (!vendor) throw new NotFoundException('No account found for this email');
    if (vendor.isEmailVerified) throw new BadRequestException('Email is already verified');

    const code = await this.otpService.issue(vendor._id, vendor.email, OtpPurpose.EMAIL_VERIFICATION);
    await this.mailService.sendOtpEmail(vendor.email, vendor.name, code, this.otpService.expiryMinutes);

    return {
      message: 'A new OTP has been sent to your email',
      data: { otpExpiresInMinutes: this.otpService.expiryMinutes },
    };
  }

  async login(dto: LoginDto) {
    const vendor = await this.vendorsService.findByEmail(dto.email, true);
    // Same generic message for unknown email and wrong password.
    if (!vendor) throw new UnauthorizedException('Invalid email or password');

    const ok = await this.vendorsService.comparePassword(dto.password, vendor.password);
    if (!ok) throw new UnauthorizedException('Invalid email or password');

    if (!vendor.isEmailVerified) {
      throw new UnauthorizedException('Email is not verified. Please verify the OTP first.');
    }
    if (!vendor.isActive) throw new UnauthorizedException('This account has been deactivated');

    vendor.lastLoginAt = new Date();
    await vendor.save();

    const safeVendor = await this.vendorsService.findByIdRaw(vendor._id.toString());
    return {
      message: 'Login successful',
      data: { vendor: safeVendor, ...this.signToken(vendor._id.toString(), vendor.email) },
    };
  }

  /** Always responds the same way so emails cannot be enumerated. */
  async forgotPassword(dto: ForgotPasswordDto) {
    const vendor = await this.vendorsService.findByEmail(dto.email);
    if (vendor && vendor.isEmailVerified) {
      const code = await this.otpService.issue(vendor._id, vendor.email, OtpPurpose.PASSWORD_RESET);
      await this.mailService.sendPasswordResetEmail(
        vendor.email,
        vendor.name,
        code,
        this.otpService.expiryMinutes,
      );
    }
    return {
      message: 'If an account exists for this email, a reset code has been sent.',
      data: null,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const vendor = await this.vendorsService.findByEmail(dto.email);
    if (!vendor) throw new NotFoundException('No account found for this email');

    await this.otpService.verify(dto.email, dto.otp, OtpPurpose.PASSWORD_RESET);

    vendor.password = await this.vendorsService.hashPassword(dto.newPassword);
    await vendor.save();

    return { message: 'Password reset successfully. Please log in.', data: null };
  }
}
