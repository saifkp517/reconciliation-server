import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Patch,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateItemDto, SetQuantityDto, SetPriceDto, SetNameDto } from './dto/inventory.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('items')
  getItems(@Query('type') type?: 'raw_material' | 'product') {
    return this.inventoryService.getAllItems(type);
  }

  @Get('items/:id')
  getItem(@Param('id', ParseIntPipe) id: number) {
    return this.inventoryService.getItem(id);
  }

  @Post('items')
  @HttpCode(HttpStatus.CREATED)
  createItem(@Body() dto: CreateItemDto) {
    return this.inventoryService.createItem(dto.name, dto.type, dto.unit, dto.price);
  }

  @Delete('items/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteItem(@Param('id', ParseIntPipe) id: number) {
    return this.inventoryService.deleteItem(id);
  }

  @Patch('items/:id/quantity')
  setQuantity(@Param('id', ParseIntPipe) id: number, @Body() dto: SetQuantityDto) {
    return this.inventoryService.setQuantity(id, dto.quantity);
  }

  @Patch('items/:id/price')
  setPrice(@Param('id', ParseIntPipe) id: number, @Body() dto: SetPriceDto) {
    return this.inventoryService.setPrice(id, dto.price);
  }

  @Patch('items/:id/name')
  setName(@Param('id', ParseIntPipe) id: number, @Body() dto: SetNameDto) {
    return this.inventoryService.setName(id, dto.name);
  }

  @Get('logs')
  getLogs() {
    return this.inventoryService.getTransactionLogs();
  }
}
