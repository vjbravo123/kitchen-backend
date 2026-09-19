import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Recipe, RecipeSchema } from '../recipes/schemas/recipe.schema';
import { CostingService } from './costing.service';
import { CostingController } from './costing.controller';
import { IngredientsModule } from '../ingredients/ingredients.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Recipe.name, schema: RecipeSchema }]),
    IngredientsModule,
  ],
  controllers: [CostingController],
  providers: [CostingService],
  exports: [CostingService],
})
export class CostingModule {}
