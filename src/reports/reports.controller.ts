import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
    constructor(private readonly reportsService: ReportsService) { }

    @Get('range')
    async getReportByDateRange(
        @Query('startDate') startDate: string,
        @Query('endDate') endDate: string,
    ) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

        if (!startDate || !dateRegex.test(startDate)) {
            throw new BadRequestException('startDate query param required in YYYY-MM-DD format');
        }
        if (!endDate || !dateRegex.test(endDate)) {
            throw new BadRequestException('endDate query param required in YYYY-MM-DD format');
        }
        if (new Date(startDate) > new Date(endDate)) {
            throw new BadRequestException('startDate must be before or equal to endDate');
        }

        return this.reportsService.getReportByDateRange(startDate, endDate);
    }
}