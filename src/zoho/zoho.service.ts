import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import axios, { AxiosInstance } from 'axios';
import pLimit from 'p-limit';
import { CachedEntry, CacheService, FETCH_CONCURRENCY } from '../cache/cache.service';

export interface ZohoLineItem {
  line_item_id: string;
  item_id: string;
  name: string;
  quantity: number;
  rate: number;
  item_total: number;
}

export interface ZohoQuote {
  estimate_id: string;
  estimate_number: string;
  date: string;
  status: string;
  customer_name: string;
  customer_id: string;
  total: number;
  total_quantity: number;
  line_items?: ZohoLineItem[];
  cached_at?: number; // timestamp when this record was cached, used for cache staleness checks
}

export interface ZohoListResponse {
  quotes: ZohoQuote[];
  unavailableDates: string[];  // dates we couldn't fetch due to rate limit
  partial: boolean;
}

@Injectable()
export class ZohoService {
  private readonly logger = new Logger(ZohoService.name);
  private readonly baseUrl = 'https://www.zohoapis.in/books/v3';
  private readonly orgId: string;

  constructor(
    private authService: AuthService,
    private configService: ConfigService,
    private readonly cache: CacheService,
  ) {
    this.orgId = this.configService.get<string>('ZOHO_ORGANIZATION_ID')!;
  }

  // builds an axios instance with a fresh token every time
  private async getClient(): Promise<AxiosInstance> {
    const token = await this.authService.getValidAccessToken();
    return axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
      },
      params: {
        organization_id: this.orgId,
      },
    });
  }

  // ─── index helpers ────────────────────────────────────────────────────────────

  private dayIndexKey(date: string) {
    return `zoho:quotes:index:${date}`;
  }

  /** All calendar dates (YYYY-MM-DD) in [fromDate, toDate] inclusive */
  private datesInRange(fromDate: string, toDate: string): string[] {
    const dates: string[] = [];
    const cur = new Date(fromDate);
    const end = new Date(toDate);
    while (cur <= end) {
      dates.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }

  private async getIndexForDate(date: string): Promise<string[]> {
    return (await this.cache.get<string[]>(this.dayIndexKey(date))) ?? [];
  }

  private async addToDateIndex(date: string, quoteId: string): Promise<void> {
    const ids = await this.getIndexForDate(date);
    if (!ids.includes(quoteId)) {
      await this.cache.set(this.dayIndexKey(date), [...ids, quoteId]);
    }
  }

  async _populateCacheFromList(quotes: ZohoQuote[]): Promise<void> {
    const byDate = new Map<string, string[]>();
    for (const q of quotes) {
      const day = q.date.slice(0, 10);
      if (!byDate.has(day)) byDate.set(day, []);
      byDate.get(day)!.push(q.estimate_id);
    }

    // Only persist day indexes — never cache shallow list entries
    await Promise.all(
      [...byDate.entries()].map(([date, ids]) =>
        this.cache.set(this.dayIndexKey(date), ids)
      )
    );
  }

  private isSunday(date: string): boolean {
    return new Date(date).getDay() === 0;
  }

  // fetches ALL quotes for a date range (list endpoint, no line items)
  async listQuotes(fromDate: string, toDate: string): Promise<ZohoListResponse> {
    const dates = this.datesInRange(fromDate, toDate);
    const allQuotes: ZohoQuote[] = [];
    const unavailableDates: string[] = [];
    let rateLimitHit = false;

    for (const date of dates) {
      if (this.isSunday(date)) continue;

      const ids = await this.getIndexForDate(date);

      if (ids.length > 0) {
        const cacheChecks = await Promise.all(
          ids.map(id => this.cache.get<CachedEntry<ZohoQuote>>(`zoho:quote:${id}`))
        );
        const cached = cacheChecks
          .filter(Boolean)
          .map(entry => ({ ...entry!.data, cached_at: entry!.cachedAt }));

        allQuotes.push(...cached);

        const missingIds = ids.filter((_, i) => !cacheChecks[i]);

        if (missingIds.length > 0 && !rateLimitHit) {
          try {
            const fetched = await this._fetchDetailsFromZoho(missingIds);
            await Promise.all(
              fetched.map(q =>
                this.cache.set(`zoho:quote:${q.estimate_id}`, {
                  data: q,
                  cachedAt: Date.now(),
                } satisfies CachedEntry<ZohoQuote>)
              )
            );
            allQuotes.push(...fetched.map(q => ({ ...q, cached_at: Date.now() })));
          } catch (err: any) {
            if (err?.type === 'RATE_LIMIT_EXCEEDED') {
              rateLimitHit = true;
              unavailableDates.push(date);
              this.logger.warn(`⚠️ Rate limit hit on detail fetch — stopping Zoho calls`);
            } else {
              throw err;
            }
          }
        } else if (missingIds.length > 0 && rateLimitHit) {
          unavailableDates.push(date);
        }

        continue;
      }

      // No index for this date
      if (rateLimitHit) {
        unavailableDates.push(date);
        continue;
      }

      try {
        const fetched = await this._fetchListFromZoho(date, date);
        await this._populateCacheFromList(fetched);
        allQuotes.push(...fetched);
      } catch (err: any) {
        if (err?.type === 'RATE_LIMIT_EXCEEDED') {
          rateLimitHit = true;
          unavailableDates.push(date);
          this.logger.warn(`⚠️ Rate limit hit on list fetch — stopping Zoho calls`);
        } else {
          throw err;
        }
      }
    }

    return {
      quotes: allQuotes,
      unavailableDates,
      partial: unavailableDates.length > 0,
    };
  }

  async _fetchListFromZoho(fromDate: string, toDate: string): Promise<ZohoQuote[]> {
    this.logger.log(`📋 Fetching Zoho Quotes list from ${fromDate} to ${toDate}`);
    const client = await this.getClient();
    const allQuotes: ZohoQuote[] = [];
    let page = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      try {
        const response = await client.get('/estimates', {
          params: {
            date_start: fromDate,
            date_end: toDate,
            page,
            per_page: 200,
          },
        });

        const { estimates, page_context } = response.data;
        allQuotes.push(...estimates);

        hasMorePages = page_context?.has_more_page ?? false;
        page++;

        this.logger.log(`📄 Fetched page ${page - 1}, total so far: ${allQuotes.length}`);
      } catch (err) {
        this.handleZohoError(err);
      }
    }

    this.logger.log(`✅ Total Zoho Quotes fetched: ${allQuotes.length}`);
    return allQuotes;
  }

  // fetches full details (including line items) for a single quote
  async getQuoteDetail(quoteId: string): Promise<ZohoQuote> {
    const cacheKey = `zoho:quote:${quoteId}`;

    const cached = await this.cache.get<CachedEntry<ZohoQuote>>(cacheKey);
    if (cached && cached.data.line_items && cached.data.line_items.length > 0) {
      this.logger.debug(`Cache HIT  [detail] ${cacheKey}`);
      return { ...cached.data, cached_at: cached.cachedAt };
    }
    this.logger.debug(`Cache MISS [detail] ${cacheKey}`);

    const client = await this.getClient();
    try {
      const response = await client.get(`/estimates/${quoteId}`);
      const quote = response.data.estimate;

      await this.cache.set(cacheKey, { data: quote, cachedAt: Date.now() } satisfies CachedEntry<ZohoQuote>);
      return quote;
    } catch (err) {
      this.handleZohoError(err);
    }
  }

  // fetches details for multiple quotes — used during deep check on suspicious days
  async getQuoteDetails(quoteIds: string[]): Promise<ZohoQuote[]> {
    this.logger.log(`🔍 Fetching details for ${quoteIds.length} quotes`);

    const cacheChecks = await Promise.all(
      quoteIds.map(id =>
        this.cache.get<CachedEntry<ZohoQuote>>(`zoho:quote:${id}`)
      )
    );

    const fresh: ZohoQuote[] = [];
    const missingIds: string[] = [];

    for (let i = 0; i < quoteIds.length; i++) {
      const entry = cacheChecks[i];

      if (entry) {
        this.logger.debug(`Cache HIT  [detail] zoho:quote:${quoteIds[i]}`);
        fresh.push({ ...entry.data, cached_at: entry.cachedAt });
      } else {
        this.logger.debug(`Cache MISS [detail] zoho:quote:${quoteIds[i]}`);
        missingIds.push(quoteIds[i]);
      }
    }

    if (missingIds.length === 0) return fresh;

    const fetched = await this._fetchDetailsFromZoho(missingIds);

    await Promise.all(
      fetched.map(quote =>
        this.cache.set(
          `zoho:quote:${quote.estimate_id}`,
          { data: quote, cachedAt: Date.now() } satisfies CachedEntry<ZohoQuote>,
        )
      )
    );

    const fetchedWithMeta: ZohoQuote[] = fetched.map(quote => ({
      ...quote,
      cached_at: Date.now(),
    }));

    return [...fresh, ...fetchedWithMeta];
  }

  async _fetchDetailsFromZoho(quoteIds: string[]): Promise<ZohoQuote[]> {
    const limit = pLimit(FETCH_CONCURRENCY);
    const results: ZohoQuote[] = [];

    await Promise.all(
      quoteIds.map(id =>
        limit(async () => {
          try {
            const detail = await this.getQuoteDetail(id);
            if (detail) results.push(detail);
          } catch (err: any) {
            if (err?.type === 'RATE_LIMIT_EXCEEDED') throw err;
            this.logger.warn(`⚠️ Failed to fetch detail for Quote ${id}: ${err?.message}`);
          }
        })
      )
    );

    return results;
  }

  // ─── ERROR HANDLING ───────────────────────────────────────────────────────────

  private handleZohoError(err: any): never {
    const status = err?.response?.status;
    const message = err?.response?.data?.message || err.message;

    if (status === 429) {
      this.logger.error('❌ Zoho API rate limit exceeded');
      throw {
        type: 'RATE_LIMIT_EXCEEDED',
        message: 'Zoho API rate limit exceeded. Please upgrade your Zoho plan or try again later.',
      };
    }

    if (status === 401) {
      this.logger.error('❌ Zoho authentication failed');
      throw {
        type: 'AUTH_ERROR',
        message: 'Zoho authentication failed. Check your credentials.',
      };
    }

    this.logger.error(`❌ Zoho API error: ${message}`);
    throw {
      type: 'ZOHO_API_ERROR',
      message: `Zoho API error: ${message}`,
    };
  }
}