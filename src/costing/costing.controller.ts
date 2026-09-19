import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentVendor } from '../common/decorators/current-vendor.decorator';
import { CostingService } from './costing.service';
import { CostQueryDto, SuggestPriceDto } from './dto/cost-query.dto';
import { ObjectIdParamDto } from '../common/dto/object-id.param';

@Controller('costing')
@UseGuards(JwtAuthGuard)
export class CostingController {
  constructor(private readonly costingService: CostingService) {}

  /** Full cost breakdown at today's ingredient prices. */
  @Get('recipes/:id')
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

  @Post('recipes/:id/suggest-price')
  @HttpCode(HttpStatus.OK)
  async suggestPrice(
    @CurrentVendor('vendorId') vendorId: string,
    @Param() { id }: ObjectIdParamDto,
    @Body() dto: SuggestPriceDto,
  ) {
    return {
      message: 'Suggested selling price calculated',
      data: await this.costingService.suggestPrice(vendorId, id, dto.targetMarginPercent, dto.servings),
    };
  }
}
