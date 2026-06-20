import { Controller, Get, Patch, Post, Param, Body, Query } from "@nestjs/common";
import { TrucksService } from "./trucks.service";

@Controller('trucks')
export class TrucksController {
  constructor(private readonly trucksService: TrucksService) { }

  @Get()
  getAllTrucks() {
    return this.trucksService.getAllTrucks();
  }

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

  @Post()
  addTruck(@Body() body: {
    registration_no: string;
    is_available?: boolean;
    mv_tax_renewal_date?: string;
    vehicle_fitness_renewal_date?: string;
    insurance_expiry_renewal_date?: string;
    vehicle_pucc_renewal_date?: string;
  }) {
    return this.trucksService.addTruck(body);
  }

  @Patch(':id')
  editTruck(
    @Param('id') id: number,
    @Body() body: {
      registration_no?: string;
      is_available?: boolean;
      mv_tax_renewal_date?: string;
      vehicle_fitness_renewal_date?: string;
      insurance_expiry_renewal_date?: string;
      vehicle_pucc_renewal_date?: string;
    },
  ) {
    return this.trucksService.editTruck(Number(id), body);
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