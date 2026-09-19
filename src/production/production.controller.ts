import {
  Body,
  Controller,
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
import { ProductionService } from './production.service';
import { CreateProductionDto } from './dto/prepare-recipe.dto';
import { QueryProductionDto } from './dto/query-production.dto';
import { ObjectIdParamDto } from '../common/dto/object-id.param';

@Controller('production')
@UseGuards(JwtAuthGuard)
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  /** Alternative to POST /recipes/:id/prepare. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentVendor('vendorId') vendorId: string, @Body() dto: CreateProductionDto) {
    const { recipeId, ...rest } = dto;
    return {
      message: 'Production recorded and inventory updated',
      data: await this.productionService.prepare(vendorId, recipeId, rest),
    };
  }

  @Get()
  async findAll(@CurrentVendor('vendorId') vendorId: string, @Query() query: QueryProductionDto) {
    return {
      message: 'Production records fetched',
      data: await this.productionService.findAll(vendorId, query),
    };
  }

  @Get('summary')
  async summary(
    @CurrentVendor('vendorId') vendorId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return {
      message: 'Production summary',
      data: await this.productionService.summary(vendorId, from, to),
    };
  }

  @Get(':id')
  async findOne(@CurrentVendor('vendorId') vendorId: string, @Param() { id }: ObjectIdParamDto) {
    return {
      message: 'Production record fetched',
      data: await this.productionService.findOne(vendorId, id),
    };
  }

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@CurrentVendor('vendorId') vendorId: string, @Param() { id }: ObjectIdParamDto) {
    return {
      message: 'Production cancelled and stock restored',
      data: await this.productionService.cancel(vendorId, id),
    };
  }
}
