import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { BillsService, BulkUpdateBillDto, RecordPaymentDto } from './bills.service';
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

  // Must come before :id to avoid being swallowed by the dynamic segment
  @Get('price-list/:customerId')
  getPriceList(@Param('customerId', ParseIntPipe) customerId: number) {
    return this.billsService.getPriceListByCustomer(customerId);
  }

  @Get('customer/:customerId/outstanding')
  getCustomerOutstanding(@Param('customerId', ParseIntPipe) customerId: number) {
    return this.billsService.getCustomerOutstanding(customerId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.billsService.findOne(id);
  }

  @Patch('bulk')
  bulkUpdate(@Body() updates: BulkUpdateBillDto[]) {
    return this.billsService.bulkUpdate(updates);
  }

  @Patch(':id')
  recordPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.billsService.recordPayment(id, dto);
  }
}