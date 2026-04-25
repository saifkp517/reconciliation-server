import { Injectable, Logger } from '@nestjs/common';
import { ZohoService } from '../zoho/zoho.service';
import { CacheService } from './cache.service';
import { CachedEntry } from './cache.service';
import { ZohoSalesOrder } from '../zoho/zoho.service';

const DETAIL_STALE_MS = 15 * 60 * 1000;

@Injectable()
export class ZohoCacheWarmService {
  private readonly logger = new Logger(ZohoCacheWarmService.name);

  constructor(
    private readonly zoho: ZohoService,
    private readonly cache: CacheService,
  ) { }

  async forceFetchList(fromDate: string, toDate: string): Promise<ZohoSalesOrder[]> {
    const key = `zoho:orders:${fromDate}:${toDate}`;
    const orders = await this.zoho._fetchListFromZoho(fromDate, toDate);
    await this.cache.set(key, orders);
    return orders;
  }

  async forceFetchDetails(salesOrderIds: string[]): Promise<void> {
    this.logger.log(`🔥 Force fetching ${salesOrderIds.length} SO details`);
    const fetched = await this.zoho._fetchDetailsFromZoho(salesOrderIds);
    await Promise.all(
      fetched.map(order =>
        this.cache.set(
          `zoho:order:${order.salesorder_id}`,
          { data: order, cachedAt: Date.now() } satisfies CachedEntry<ZohoSalesOrder>,
        )
      )
    );
    this.logger.log(`✅ Force fetched and cached ${fetched.length} orders`);
  }

  async warmCache(fromDate: string, toDate: string): Promise<void> {
    this.logger.log(`🔥 Warming cache for ${fromDate} → ${toDate}`);

    // Force fresh list from Zoho, bypassing range cache
    const orders = await this.forceFetchList(fromDate, toDate);
    this.logger.log(`Fetched ${orders.length} orders from Zoho`);

    // Force fetch all details and write to cache
    await this.forceFetchDetails(orders.map(o => o.salesorder_id));

    this.logger.log(`✅ Cache warm complete for ${fromDate} → ${toDate}`);
  }


}