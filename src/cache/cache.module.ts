import { Module } from '@nestjs/common';
import { ZohoCacheWarmService } from './zoho-cache-warm.service';
import { ZohoCacheWarmController } from './cache.controller';
import { CacheService } from './cache.service';
import { ZohoModule } from '../zoho/zoho.module';

@Module({
  imports: [
    ZohoModule, // provides ZohoService
  ],
  controllers: [ZohoCacheWarmController],
  providers: [
    ZohoCacheWarmService,
    CacheService,
  ],
  exports: [ZohoCacheWarmService],
})
export class ZohoCacheWarmModule {}