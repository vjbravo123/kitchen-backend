import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  InventoryTransaction,
  InventoryTransactionSchema,
} from './schemas/inventory-transaction.schema';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { IngredientsModule } from '../ingredients/ingredients.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: InventoryTransaction.name, schema: InventoryTransactionSchema },
    ]),
    IngredientsModule,
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
