import { Controller, Get, Post, Body, Patch, Param, ParseIntPipe } from '@nestjs/common';
import { WatchmanLogsService } from './watchmanlogs.service';
import type { CreateWatchmanLogDto, UpdateWatchmanLogDto } from './watchmanlogs.service';

@Controller('watchmanlogs')
export class WatchmanLogsController {
  constructor(private watchmanLogsService: WatchmanLogsService) { }

  @Post()
  async createWatchmanLog(@Body() dto: CreateWatchmanLogDto) {
    return this.watchmanLogsService.createWatchmanLog(dto);
  }

  @Patch(':id')
  updateOne(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateWatchmanLogDto,
  ) {
    return this.watchmanLogsService.updateOne(id, body);
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
