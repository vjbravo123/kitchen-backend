import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { Otp, OtpDocument, OtpPurpose } from './schemas/otp.schema';

@Injectable()
export class OtpService {
  constructor(
    @InjectModel(Otp.name) private readonly otpModel: Model<Otp>,
    private readonly config: ConfigService,
  ) {}

  private generateCode(): string {
    // Cryptographically adequate 6-digit code (100000-999999).
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  get expiryMinutes(): number {
    return this.config.get<number>('otp.expiryMinutes');
  }

  /**
   * Invalidates any pending OTP for this email+purpose and issues a new one.
   * Returns the plain code so the caller can email it (it is stored hashed).
   */
  async issue(vendorId: Types.ObjectId | string, email: string, purpose: OtpPurpose): Promise<string> {
    const cooldown = this.config.get<number>('otp.resendCooldownSeconds');
    const latest = await this.otpModel
      .findOne({ email, purpose, consumedAt: null })
      .sort({ createdAt: -1 })
      .lean();

    if (latest) {
      const ageSeconds = (Date.now() - new Date((latest as any).createdAt).getTime()) / 1000;
      if (ageSeconds < cooldown) {
        throw new BadRequestException(
          `Please wait ${Math.ceil(cooldown - ageSeconds)} seconds before requesting a new OTP`,
        );
      }
    }

    await this.otpModel.updateMany(
      { email, purpose, consumedAt: null },
      { $set: { consumedAt: new Date() } },
    );

    const code = this.generateCode();
    await this.otpModel.create({
      vendor: new Types.ObjectId(vendorId),
      email,
      codeHash: await bcrypt.hash(code, 10),
      purpose,
      expiresAt: new Date(Date.now() + this.expiryMinutes * 60 * 1000),
    });

    return code;
  }

  /** Verifies and consumes an OTP. Throws on invalid/expired/too many attempts. */
  async verify(email: string, code: string, purpose: OtpPurpose): Promise<void> {
    const otp = await this.otpModel.findOne({ email, purpose, consumedAt: null }).sort({ createdAt: -1 });

    if (!otp) throw new BadRequestException('No pending OTP found. Please request a new one.');

    if (otp.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('OTP has expired. Please request a new one.');
    }

    const maxAttempts = this.config.get<number>('otp.maxAttempts');
    if (otp.attempts >= maxAttempts) {
      throw new UnauthorizedException('Too many invalid attempts. Please request a new OTP.');
    }

    const matches = await bcrypt.compare(code, otp.codeHash);
    if (!matches) {
      otp.attempts += 1;
      await otp.save();
      const left = maxAttempts - otp.attempts;
      throw new BadRequestException(`Invalid OTP. ${left > 0 ? `${left} attempt(s) left.` : ''}`.trim());
    }

    otp.consumedAt = new Date();
    await otp.save();
  }
}
