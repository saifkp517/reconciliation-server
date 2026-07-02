import { Controller, Get, Post, Body, Patch, Param } from '@nestjs/common';
import { CustomersService, CreateCustomerDto, UpdateCustomerDto } from './customers.service';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  getCustomers() {
    return this.customersService.getCustomers();
  }

  @Get(':id')
  getCustomer(@Param('id') id: number) {
    return this.customersService.getCustomer(id);
  }

  @Post()
  createCustomer(@Body() body: CreateCustomerDto) {
    return this.customersService.createCustomer(body);
  }

  @Patch(':id')
  updateCustomer(@Param('id') id: number, @Body() body: UpdateCustomerDto) {
    return this.customersService.updateCustomer(id, body);
  }
}
