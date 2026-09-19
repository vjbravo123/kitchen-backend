import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Production, ProductionSchema } from './schemas/production.schema';
import { ProductionService } from './production.service';
import { ProductionController } from './production.controller';
import { CostingModule } from '../costing/costing.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Production.name, schema: ProductionSchema }]),
    CostingModule,
    InventoryModule,
  ],
  controllers: [ProductionController],
  providers: [ProductionService],
  exports: [ProductionService],
})
export class ProductionModule {}
