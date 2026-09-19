import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Recipe, RecipeSchema } from './schemas/recipe.schema';
import { RecipesService } from './recipes.service';
import { RecipesController } from './recipes.controller';
import { IngredientsModule } from '../ingredients/ingredients.module';
import { CostingModule } from '../costing/costing.module';
import { ProductionModule } from '../production/production.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Recipe.name, schema: RecipeSchema }]),
    IngredientsModule,
    CostingModule,
    ProductionModule,
  ],
  controllers: [RecipesController],
  providers: [RecipesService],
  exports: [RecipesService],
})
export class RecipesModule {}
