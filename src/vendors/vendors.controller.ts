import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentVendor } from '../common/decorators/current-vendor.decorator';
import { VendorsService } from './vendors.service';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { ChangePasswordDto } from '../auth/dto/password-reset.dto';

@Controller('vendors')
@UseGuards(JwtAuthGuard)
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get('me')
  async me(@CurrentVendor('vendorId') vendorId: string) {
    return { message: 'Profile fetched', data: await this.vendorsService.getProfile(vendorId) };
  }

  @Patch('me')
  async update(@CurrentVendor('vendorId') vendorId: string, @Body() dto: UpdateVendorDto) {
    return { message: 'Profile updated', data: await this.vendorsService.updateProfile(vendorId, dto) };
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.OK)
  async changePassword(@CurrentVendor('vendorId') vendorId: string, @Body() dto: ChangePasswordDto) {
    await this.vendorsService.changePassword(vendorId, dto);
    return { message: 'Password changed successfully', data: null };
  }

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  async deactivate(@CurrentVendor('vendorId') vendorId: string) {
    await this.vendorsService.deactivate(vendorId);
    return { message: 'Account deactivated', data: null };
  }
}
