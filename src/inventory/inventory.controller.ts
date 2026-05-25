import { Controller, Post, Get, Body, Param, UseGuards, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { AddBlockStockDto, AddCementBagsDto } from './dto/inventory.dto';
import { InventoryItemName } from './entities/inventory_items.entity';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) { }

  @Get('stock')
  getAllStock() {
    return this.inventoryService.getAllStock();
  }

  @Get('logs')
  getProductionLogs() {
    return this.inventoryService.getProductionLogs();
  }

  @Get('stock/:name')
  getStock(@Param('name') name: InventoryItemName) {
    return this.inventoryService.getStock(name);
  }

  @Post('cement/restock')
  @HttpCode(HttpStatus.OK)
  restockCement(@Body() dto: AddCementBagsDto) {
    return this.inventoryService.addCementStock(dto.amount);
  }

  @Post('produce')
  @HttpCode(HttpStatus.OK)
  logProduction(@Body() dto: AddBlockStockDto) {
    return this.inventoryService.manufactureBlocks(dto);
  }
}