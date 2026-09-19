import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentVendor } from '../common/decorators/current-vendor.decorator';
import { RecipesService } from './recipes.service';
import { CostingService } from '../costing/costing.service';
import { ProductionService } from '../production/production.service';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { UpdateRecipeDto } from './dto/update-recipe.dto';
import { RecipeItemDto } from './dto/recipe-item.dto';
import { QueryRecipesDto } from './dto/query-recipes.dto';
import { ScaleRecipeDto } from './dto/scale-recipe.dto';
import { CostQueryDto } from '../costing/dto/cost-query.dto';
import { PrepareRecipeDto } from '../production/dto/prepare-recipe.dto';
import { ObjectIdParamDto } from '../common/dto/object-id.param';

@Controller('recipes')
@UseGuards(JwtAuthGuard)
export class RecipesController {
  constructor(
    private readonly recipesService: RecipesService,
    private readonly costingService: CostingService,
    private readonly productionService: ProductionService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentVendor('vendorId') vendorId: string, @Body() dto: CreateRecipeDto) {
    return { message: 'Recipe created', data: await this.recipesService.create(vendorId, dto) };
  }

  @Get()
  async findAll(@CurrentVendor('vendorId') vendorId: string, @Query() query: QueryRecipesDto) {
    return { message: 'Recipes fetched', data: await this.recipesService.findAll(vendorId, query) };
  }

  @Get(':id')
  async findOne(@CurrentVendor('vendorId') vendorId: string, @Param() { id }: ObjectIdParamDto) {
    return { message: 'Recipe fetched', data: await this.recipesService.findOne(vendorId, id) };
  }

  /** Live cost at today's ingredient prices. */
  @Get(':id/cost')
  async cost(
    @CurrentVendor('vendorId') vendorId: string,
    @Param() { id }: ObjectIdParamDto,
    @Query() query: CostQueryDto,
  ) {
    return {
      message: 'Cost calculated',
      data: await this.costingService.costRecipe(vendorId, id, query),
    };
  }

  /** Preview a different batch size. Does not modify the recipe. */
  @Post(':id/scale')
  @HttpCode(HttpStatus.OK)
  async scale(
    @CurrentVendor('vendorId') vendorId: string,
    @Param() { id }: ObjectIdParamDto,
    @Body() dto: ScaleRecipeDto,
  ) {
    return { message: 'Scaled recipe calculated', data: await this.recipesService.scale(vendorId, id, dto) };
  }

  @Get(':id/availability')
  async availability(
    @CurrentVendor('vendorId') vendorId: string,
    @Param() { id }: ObjectIdParamDto,
    @Query() query: CostQueryDto,
  ) {
    return {
      message: 'Availability checked',
      data: await this.recipesService.availability(vendorId, id, query.servings),
    };
  }

  /** Produce/sell a batch: deducts stock and freezes the costing. */
  @Post(':id/prepare')
  @HttpCode(HttpStatus.CREATED)
  async prepare(
    @CurrentVendor('vendorId') vendorId: string,
    @Param() { id }: ObjectIdParamDto,
    @Body() dto: PrepareRecipeDto,
  ) {
    return {
      message: 'Production recorded and inventory updated',
      data: await this.productionService.prepare(vendorId, id, dto),
    };
  }

  @Patch(':id')
  async update(
    @CurrentVendor('vendorId') vendorId: string,
    @Param() { id }: ObjectIdParamDto,
    @Body() dto: UpdateRecipeDto,
  ) {
    return { message: 'Recipe updated', data: await this.recipesService.update(vendorId, id, dto) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@CurrentVendor('vendorId') vendorId: string, @Param() { id }: ObjectIdParamDto) {
    return { message: 'Recipe archived', data: await this.recipesService.remove(vendorId, id) };
  }

  /* --------------------------- recipe ingredients -------------------------- */

  @Post(':id/ingredients')
  @HttpCode(HttpStatus.CREATED)
  async addItem(
    @CurrentVendor('vendorId') vendorId: string,
    @Param() { id }: ObjectIdParamDto,
    @Body() dto: RecipeItemDto,
  ) {
    return {
      message: 'Ingredient added to recipe',
      data: await this.recipesService.addItem(vendorId, id, dto),
    };
  }

  @Patch(':id/ingredients/:ingredientId')
  async updateItem(
    @CurrentVendor('vendorId') vendorId: string,
    @Param('id') id: string,
    @Param('ingredientId') ingredientId: string,
    @Body() dto: RecipeItemDto,
  ) {
    return {
      message: 'Recipe ingredient updated',
      data: await this.recipesService.updateItem(vendorId, id, ingredientId, dto),
    };
  }

  @Delete(':id/ingredients/:ingredientId')
  @HttpCode(HttpStatus.OK)
  async removeItem(
    @CurrentVendor('vendorId') vendorId: string,
    @Param('id') id: string,
    @Param('ingredientId') ingredientId: string,
  ) {
    return {
      message: 'Recipe ingredient removed',
      data: await this.recipesService.removeItem(vendorId, id, ingredientId),
    };
  }
}
