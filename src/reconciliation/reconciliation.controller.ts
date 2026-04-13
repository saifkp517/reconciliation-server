import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';

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
}