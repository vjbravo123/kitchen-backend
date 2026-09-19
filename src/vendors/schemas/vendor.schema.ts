import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type VendorDocument = HydratedDocument<Vendor>;

@Schema({ timestamps: true })
export class Vendor {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true })
  email: string;

  @Prop({ required: true, select: false })
  password: string;

  @Prop({ trim: true })
  businessName?: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ default: 'INR' })
  currency: string;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastLoginAt?: Date;
}

export const VendorSchema = SchemaFactory.createForClass(Vendor);

VendorSchema.index({ email: 1 }, { unique: true });

VendorSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: any) => {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});
