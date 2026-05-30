import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { BillsService } from './bills.service';
import { CreateBillDto } from './entities/create-bill.dto';

@Controller('bills')
export class BillsController {
  constructor(private readonly billsService: BillsService) { }

  @Post()
  create(@Body() dto: CreateBillDto) {
    return this.billsService.createBill(dto);
  }

  @Get()
  findAll() {
    return this.billsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.billsService.findOne(id);
  }

  @Get('price-list/:customerId')
  getPriceList(@Param('customerId', ParseIntPipe) customerId: number) {
    return this.billsService.getPriceListByCustomer(customerId);
  }
}