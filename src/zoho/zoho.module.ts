import { Module } from '@nestjs/common';
import { ZohoService } from './zoho.service';
import { AuthModule } from '../auth/auth.module';
import { CacheService } from '../cache/cache.service';
import { ZohoCacheWarmService } from '../cache/zoho-cache-warm.service';

@Module({
  imports: [AuthModule],
  providers: [
    CacheService,
    ZohoService,
    ZohoCacheWarmService,
  ],
  exports: [
    ZohoService,
    CacheService,
    ZohoCacheWarmService,
  ],
})
export class ZohoModule { }