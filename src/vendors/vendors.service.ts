import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { Vendor, VendorDocument } from './schemas/vendor.schema';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { ChangePasswordDto } from '../auth/dto/password-reset.dto';

@Injectable()
export class VendorsService {
  constructor(
    @InjectModel(Vendor.name) private readonly vendorModel: Model<Vendor>,
    private readonly config: ConfigService,
  ) {}

  hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.config.get<number>('security.saltRounds'));
  }

  comparePassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  async create(data: Partial<Vendor>): Promise<VendorDocument> {
    return this.vendorModel.create(data);
  }

  findByEmail(email: string, withPassword = false) {
    const query = this.vendorModel.findOne({ email: email.toLowerCase().trim() });
    return withPassword ? query.select('+password') : query;
  }

  async findByIdRaw(id: string): Promise<VendorDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.vendorModel.findById(id);
  }

  async getProfile(vendorId: string): Promise<VendorDocument> {
    const vendor = await this.findByIdRaw(vendorId);
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  async updateProfile(vendorId: string, dto: UpdateVendorDto): Promise<VendorDocument> {
    const vendor = await this.vendorModel.findByIdAndUpdate(
      vendorId,
      { $set: { ...dto, ...(dto.currency ? { currency: dto.currency.toUpperCase() } : {}) } },
      { new: true, runValidators: true },
    );
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  async changePassword(vendorId: string, dto: ChangePasswordDto): Promise<void> {
    const vendor = await this.vendorModel.findById(vendorId).select('+password');
    if (!vendor) throw new NotFoundException('Vendor not found');

    const ok = await this.comparePassword(dto.currentPassword, vendor.password);
    if (!ok) throw new BadRequestException('Current password is incorrect');

    vendor.password = await this.hashPassword(dto.newPassword);
    await vendor.save();
  }

  async deactivate(vendorId: string): Promise<void> {
    await this.vendorModel.findByIdAndUpdate(vendorId, { $set: { isActive: false } });
  }
}
