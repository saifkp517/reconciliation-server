import { Controller, Post, Body, Logger, BadRequestException } from '@nestjs/common';
import { ZohoCacheWarmService } from './zoho-cache-warm.service';

interface WarmCacheDto {
  fromDate: string;
  toDate: string;
}

@Controller('zoho-cache')
export class ZohoCacheWarmController {
  private readonly logger = new Logger(ZohoCacheWarmController.name);

  constructor(
    private readonly warmService: ZohoCacheWarmService,
  ) {}

  @Post('warm')
  async warmCache(@Body() body: WarmCacheDto): Promise<{ status: string }> {
    const { fromDate, toDate } = body;

    if (!fromDate || !toDate) {
      throw new BadRequestException('fromDate and toDate are required');
    }

    this.logger.log(`Received warm cache request: ${fromDate} → ${toDate}`);

    await this.warmService.warmCache(fromDate, toDate);

    return { status: 'ok' };
  }
}