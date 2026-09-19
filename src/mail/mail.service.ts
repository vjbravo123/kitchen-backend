import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('mail.apiKey');
    this.from = this.config.get<string>('mail.from') || 'onboarding@resend.dev';
    this.resend = apiKey ? new Resend(apiKey) : null;

    if (!this.resend) {
      this.logger.warn(
        'RESEND_API_KEY is not set - OTP emails will be logged to the console instead of sent.',
      );
    }
  }

  async sendOtpEmail(to: string, name: string, code: string, minutes: number): Promise<void> {
    const subject = 'Your Kitchen Costing verification code';
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto">
        <h2 style="margin-bottom:4px">Hi ${name || 'there'},</h2>
        <p>Use the code below to verify your email address.</p>
        <p style="font-size:32px;letter-spacing:8px;font-weight:bold;margin:24px 0">${code}</p>
        <p>This code expires in ${minutes} minutes. If you did not request it, you can ignore this email.</p>
      </div>`;

    if (!this.resend) {
      this.logger.log(`[DEV MAIL] OTP for ${to}: ${code} (valid ${minutes} min)`);
      return;
    }

    try {
      await this.resend.emails.send({ from: this.from, to, subject, html });
      this.logger.log(`OTP email sent to ${to}`);
    } catch (err) {
      // Never leak provider errors to the client; the OTP is already stored.
      this.logger.error(`Failed to send OTP email to ${to}: ${(err as Error).message}`);
    }
  }

  async sendPasswordResetEmail(to: string, name: string, code: string, minutes: number): Promise<void> {
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto">
        <h2>Password reset</h2>
        <p>Hi ${name || 'there'}, use this code to reset your password:</p>
        <p style="font-size:32px;letter-spacing:8px;font-weight:bold;margin:24px 0">${code}</p>
        <p>The code expires in ${minutes} minutes.</p>
      </div>`;

    if (!this.resend) {
      this.logger.log(`[DEV MAIL] Password reset OTP for ${to}: ${code}`);
      return;
    }

    try {
      await this.resend.emails.send({
        from: this.from,
        to,
        subject: 'Reset your Kitchen Costing password',
        html,
      });
    } catch (err) {
      this.logger.error(`Failed to send reset email to ${to}: ${(err as Error).message}`);
    }
  }
}
