import { Controller, Get, Post, Body, Patch, Param, ParseIntPipe } from '@nestjs/common';
import { WatchmanLogsService } from './watchmanlogs.service';
import type { CreateWatchmanLogDto, UpdateCustomerDto } from './watchmanlogs.service';
import { BulkUpdateWatchmanLogDto, CreateCustomerDto } from './watchmanlogs.service';

@Controller('watchmanlogs')
export class WatchmanLogsController {
  constructor(private watchmanLogsService: WatchmanLogsService) { }

  @Post()
  async createWatchmanLog(@Body() dto: CreateWatchmanLogDto) {
    return this.watchmanLogsService.createWatchmanLog(dto);
  }

  @Get('customers')
  async getCustomers() {
    return this.watchmanLogsService.getCustomers();
  }

  @Get('customer/:id')
  async getCustomer(
    @Param('id') customerId: number
  ) {
    return this.watchmanLogsService.getCustomer(customerId);
  }

  @Post('customer')
  async createCustomer(@Body() body: CreateCustomerDto) {
    return this.watchmanLogsService.createCustomer(body);
  }

  @Patch('customer/:id')
  async updateCustomer(
    @Param('id') customerId: number,
    @Body() body: UpdateCustomerDto,
  ) {
    return this.watchmanLogsService.updateCustomer(customerId, body);
  }


  @Patch('bulk')
  bulkUpdate(@Body() updates: BulkUpdateWatchmanLogDto[]) {
    return this.watchmanLogsService.bulkUpdate(updates);
  }

  @Patch(':id')
  updateOne(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Omit<BulkUpdateWatchmanLogDto, 'id'>,
  ) {
    return this.watchmanLogsService.bulkUpdate([{ id, ...body }]).then(r => r[0]);
  }

  @Get()
  getAllWatchmanLogs() {
    return this.watchmanLogsService.getAllWatchmanLogs();
  }

  @Get(':id')
  getWatchmanLogById(@Param('id', ParseIntPipe) id: number) {
    return this.watchmanLogsService.getWatchmanLogById(id);
  }
}