import { Controller, Get, Post, Query, Body, BadRequestException } from '@nestjs/common';
import { ReconciliationService, type CommitPayload } from './reconciliation.service';

@Controller('reconciliation')
export class ReconciliationController {
  constructor(private reconciliationService: ReconciliationService) {}

  @Get()
  async reconcile(
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    if (!from || !to) {
      throw new BadRequestException('from and to query params are required (YYYY-MM-DD)');
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(from) || !dateRegex.test(to)) {
      throw new BadRequestException('Dates must be in YYYY-MM-DD format');
    }

    if (new Date(from) > new Date(to)) {
      throw new BadRequestException('from date must be before to date');
    }

    return this.reconciliationService.reconcile(from, to);
  }

  @Post('commit')
  async commit(@Body() payload: CommitPayload) {
    if (!payload.date) {
      throw new BadRequestException('date is required in commit payload');
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(payload.date)) {
      throw new BadRequestException('date must be in YYYY-MM-DD format');
    }

    if (!Array.isArray(payload.db_records) || !Array.isArray(payload.zoho_records)) {
      throw new BadRequestException('db_records and zoho_records must be arrays');
    }

    return this.reconciliationService.commit(payload);
  }
}