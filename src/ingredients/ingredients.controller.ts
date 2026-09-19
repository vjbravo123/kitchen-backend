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
import { IngredientsService } from './ingredients.service';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';
import { UpdatePriceDto } from './dto/update-price.dto';
import { QueryIngredientsDto } from './dto/query-ingredients.dto';
import { ObjectIdParamDto } from '../common/dto/object-id.param';

@Controller('ingredients')
@UseGuards(JwtAuthGuard)
export class IngredientsController {
  constructor(private readonly ingredientsService: IngredientsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentVendor('vendorId') vendorId: string, @Body() dto: CreateIngredientDto) {
    const ingredient = await this.ingredientsService.create(vendorId, dto);
    return { message: 'Ingredient created', data: this.ingredientsService.decorate(ingredient.toObject()) };
  }

  @Get()
  async findAll(@CurrentVendor('vendorId') vendorId: string, @Query() query: QueryIngredientsDto) {
    return { message: 'Ingredients fetched', data: await this.ingredientsService.findAll(vendorId, query) };
  }

  @Get(':id')
  async findOne(@CurrentVendor('vendorId') vendorId: string, @Param() { id }: ObjectIdParamDto) {
    const ingredient = await this.ingredientsService.findOne(vendorId, id);
    return { message: 'Ingredient fetched', data: this.ingredientsService.decorate(ingredient.toObject()) };
  }

  @Get(':id/price-history')
  async priceHistory(@CurrentVendor('vendorId') vendorId: string, @Param() { id }: ObjectIdParamDto) {
    return {
      message: 'Price history fetched',
      data: await this.ingredientsService.priceHistory(vendorId, id),
    };
  }

  @Patch(':id')
  async update(
    @CurrentVendor('vendorId') vendorId: string,
    @Param() { id }: ObjectIdParamDto,
    @Body() dto: UpdateIngredientDto,
  ) {
    const ingredient = await this.ingredientsService.update(vendorId, id, dto);
    return { message: 'Ingredient updated', data: this.ingredientsService.decorate(ingredient.toObject()) };
  }

  @Patch(':id/price')
  async updatePrice(
    @CurrentVendor('vendorId') vendorId: string,
    @Param() { id }: ObjectIdParamDto,
    @Body() dto: UpdatePriceDto,
  ) {
    return {
      message: 'Ingredient price updated. All recipes now use the new rate.',
      data: await this.ingredientsService.updatePrice(vendorId, id, dto),
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentVendor('vendorId') vendorId: string,
    @Param() { id }: ObjectIdParamDto,
    @Query('force') force?: string,
  ) {
    return {
      message: 'Ingredient archived',
      data: await this.ingredientsService.remove(vendorId, id, force === 'true'),
    };
  }
}
