import { Controller, Get, Post, Body } from '@nestjs/common';
import { SalesService } from './sales.service';
import type { CreateSaleDto } from './sales.service';

@Controller('sales')
export class SalesController {
  constructor(private salesService: SalesService) {}

  @Post()
  async createSale(@Body() dto: CreateSaleDto) {
    return this.salesService.createSale(dto);
  }

  @Get('customers')
  async getCustomers() {
    return this.salesService.getCustomers();
  }
}