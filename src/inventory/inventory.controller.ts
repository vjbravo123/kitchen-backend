import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentVendor } from '../common/decorators/current-vendor.decorator';
import { InventoryService } from './inventory.service';
import { PurchaseStockDto } from './dto/purchase.dto';
import { AdjustStockDto, RecordWastageDto } from './dto/adjust.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';

@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('purchase')
  @HttpCode(HttpStatus.CREATED)
  async purchase(@CurrentVendor('vendorId') vendorId: string, @Body() dto: PurchaseStockDto) {
    return { message: 'Stock added', data: await this.inventoryService.purchase(vendorId, dto) };
  }

  @Post('adjust')
  @HttpCode(HttpStatus.CREATED)
  async adjust(@CurrentVendor('vendorId') vendorId: string, @Body() dto: AdjustStockDto) {
    return { message: 'Stock adjusted', data: await this.inventoryService.adjust(vendorId, dto) };
  }

  @Post('wastage')
  @HttpCode(HttpStatus.CREATED)
  async wastage(@CurrentVendor('vendorId') vendorId: string, @Body() dto: RecordWastageDto) {
    return { message: 'Wastage recorded', data: await this.inventoryService.recordWastage(vendorId, dto) };
  }

  @Get('transactions')
  async transactions(@CurrentVendor('vendorId') vendorId: string, @Query() query: QueryTransactionsDto) {
    return {
      message: 'Inventory transactions fetched',
      data: await this.inventoryService.transactions(vendorId, query),
    };
  }

  @Get('low-stock')
  async lowStock(@CurrentVendor('vendorId') vendorId: string) {
    return { message: 'Low stock ingredients', data: await this.inventoryService.lowStock(vendorId) };
  }

  @Get('valuation')
  async valuation(@CurrentVendor('vendorId') vendorId: string) {
    return { message: 'Inventory valuation', data: await this.inventoryService.valuation(vendorId) };
  }
}
