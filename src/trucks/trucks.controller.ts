import { Controller, Get, Patch, Param, Body, Query } from "@nestjs/common";
import { TrucksService } from "./trucks.service";

@Controller('trucks')
export class TrucksController {
  constructor(private readonly trucksService: TrucksService) { }

  @Get('active')
  getActive() {
    return this.trucksService.getActiveTrucks();
  }

  @Get('inactive')
  getInactive() {
    return this.trucksService.getInactiveTrucks();
  }

  @Get('sale/:saleId')
  getBySale(@Param('saleId') saleId: number) {
    return this.trucksService.getTrucksBySale(Number(saleId));
  }

  @Patch('return/:saleTruckId')
  markReturned(
    @Param('saleTruckId') saleTruckId: number,
    @Body('returned_at') returned_at: string,
  ) {

    return this.trucksService.markTruckReturned(
      Number(saleTruckId),
      new Date(returned_at),
    );
  }

  @Get('timeline/today')
  getTodayTimeline() {
    const fromDate = new Date();
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date();
    toDate.setHours(23, 59, 59, 999);

    return this.trucksService.getTruckTimeline(fromDate, toDate);
  }

  @Get('timeline/report')
  getTimelineReport(
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
  ) {
    const from = new Date(fromDate);
    from.setHours(0, 0, 0, 0);

    const to = new Date(toDate);
    to.setHours(23, 59, 59, 999); // 👈 this is what was missing

    return this.trucksService.getTruckTimeline(from, to);
  }
}