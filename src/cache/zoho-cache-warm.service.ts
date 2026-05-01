import { Injectable, Logger } from '@nestjs/common';
import { ZohoService, ZohoQuote } from '../zoho/zoho.service';
import { CacheService, CachedEntry } from './cache.service';

const DETAIL_STALE_MS = 15 * 60 * 1000;

@Injectable()
export class ZohoCacheWarmService {
  private readonly logger = new Logger(ZohoCacheWarmService.name);

  constructor(
    private readonly zoho: ZohoService,
    private readonly cache: CacheService,
  ) { }

  async forceFetchList(fromDate: string, toDate: string): Promise<ZohoQuote[]> {
    const quotes = await this.zoho._fetchListFromZoho(fromDate, toDate);
    await this.zoho._populateCacheFromList(quotes);
    return quotes;
  }

  async forceFetchDetails(quoteIds: string[]): Promise<void> {
    this.logger.log(`🔥 Force fetching ${quoteIds.length} quote details`);
    const fetched = await this.zoho._fetchDetailsFromZoho(quoteIds);
    await Promise.all(
      fetched.map(quote =>
        this.cache.set(
          `zoho:quote:${quote.estimate_id}`,
          { data: quote, cachedAt: Date.now() } satisfies CachedEntry<ZohoQuote>,
        )
      )
    );
    this.logger.log(`✅ Force fetched and cached ${fetched.length} quotes`);
  }

  async warmCache(fromDate: string, toDate: string): Promise<void> {
    this.logger.log(`🔥 Warming cache for ${fromDate} → ${toDate}`);

    // Force fresh list from Zoho, bypassing range cache
    const quotes = await this.forceFetchList(fromDate, toDate);
    this.logger.log(`Fetched ${quotes.length} quotes from Zoho`);

    // Force fetch all details and write to cache
    await this.forceFetchDetails(quotes.map(q => q.estimate_id));

    this.logger.log(`✅ Cache warm complete for ${fromDate} → ${toDate}`);
  }
}