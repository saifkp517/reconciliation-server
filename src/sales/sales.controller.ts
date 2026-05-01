import { Controller, Get, Post, Body, Patch, Param } from '@nestjs/common';
import { SalesService } from './sales.service';
import type { CreateSaleDto } from './sales.service';

@Controller('sales')
export class SalesController {
  constructor(private salesService: SalesService) { }

  @Post()
  async createSale(@Body() dto: CreateSaleDto) {
    return this.salesService.createSale(dto);
  }

  @Get('customers')
  async getCustomers() {
    return this.salesService.getCustomers();
  }

  @Post('customer')
  async createCustomer(@Body() body: any) {
    return this.salesService.createCustomer({
      name: body.name,
      phone: body.phone,
      zoho_id: body.zoho_id,
    });
  }

  
  @Get()
  getAllSales() {
    return this.salesService.getAllSales();
  }

  @Get(':id')
  getSaleById(@Param('id') id: string) {
    return this.salesService.getSaleById(Number(id));
  }

  @Patch(':id')
  updateSale(@Param('id') id: string, @Body() dto: Partial<CreateSaleDto>) {
    return this.salesService.updateSale(Number(id), dto);
  }
}