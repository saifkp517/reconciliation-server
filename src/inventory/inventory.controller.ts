import { Controller, Post, Get, Body, Param, ParseIntPipe, HttpCode, HttpStatus, Patch } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { AddBlockStockDto, AddCementBagsDto, CreateItemDto, SetQuantityDto, SetPriceDto } from './dto/inventory.dto';
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

  @Post('stock')
  @HttpCode(HttpStatus.CREATED)
  createItem(@Body() dto: CreateItemDto) {
    return this.inventoryService.createItem(dto.name, dto.unit, dto.price);
  }

  @Patch('stock/:id/quantity')
  setQuantity(@Param('id', ParseIntPipe) id: number, @Body() dto: SetQuantityDto) {
    return this.inventoryService.setQuantity(id, dto.quantity);
  }

  @Patch('stock/:id/price')
  setPrice(@Param('id', ParseIntPipe) id: number, @Body() dto: SetPriceDto) {
    return this.inventoryService.setPrice(id, dto.price);
  }

  @Post('produce')
  @HttpCode(HttpStatus.OK)
  logProduction(@Body() dto: AddBlockStockDto) {
    return this.inventoryService.manufactureBlocks(dto);
  }
}