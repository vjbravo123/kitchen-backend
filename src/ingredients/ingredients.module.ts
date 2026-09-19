import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Ingredient, IngredientSchema } from './schemas/ingredient.schema';
import { PriceHistory, PriceHistorySchema } from './schemas/price-history.schema';
import { Recipe, RecipeSchema } from '../recipes/schemas/recipe.schema';
import {
  InventoryTransaction,
  InventoryTransactionSchema,
} from '../inventory/schemas/inventory-transaction.schema';
import { IngredientsService } from './ingredients.service';
import { IngredientsController } from './ingredients.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Ingredient.name, schema: IngredientSchema },
      { name: PriceHistory.name, schema: PriceHistorySchema },
      { name: Recipe.name, schema: RecipeSchema },
      { name: InventoryTransaction.name, schema: InventoryTransactionSchema },
    ]),
  ],
  controllers: [IngredientsController],
  providers: [IngredientsService],
  exports: [IngredientsService, MongooseModule],
})
export class IngredientsModule {}
