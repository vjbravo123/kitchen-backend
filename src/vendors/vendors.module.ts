import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Vendor, VendorSchema } from './schemas/vendor.schema';
import { VendorsService } from './vendors.service';
import { VendorsController } from './vendors.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Vendor.name, schema: VendorSchema }]),
    forwardRef(() => AuthModule),
  ],
  controllers: [VendorsController],
  providers: [VendorsService],
  exports: [VendorsService, MongooseModule],
})
export class VendorsModule {}
