import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OtpDocument = HydratedDocument<Otp>;

export enum OtpPurpose {
  EMAIL_VERIFICATION = 'EMAIL_VERIFICATION',
  PASSWORD_RESET = 'PASSWORD_RESET',
}

@Schema({ timestamps: true })
export class Otp {
  @Prop({ type: Types.ObjectId, ref: 'Vendor', required: true, index: true })
  vendor: Types.ObjectId;

  @Prop({ required: true, lowercase: true, trim: true, index: true })
  email: string;

  /** The OTP is never stored in plain text. */
  @Prop({ required: true })
  codeHash: string;

  @Prop({ type: String, enum: OtpPurpose, required: true })
  purpose: OtpPurpose;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ default: null })
  consumedAt: Date | null;
}

export const OtpSchema = SchemaFactory.createForClass(Otp);

OtpSchema.index({ email: 1, purpose: 1, consumedAt: 1 });
// TTL index: expired OTP documents are removed automatically by MongoDB.
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
