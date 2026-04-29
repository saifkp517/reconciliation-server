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

export interface ZohoSalesOrder {
  salesorder_id: string;
  salesorder_number: string;
  date: string;
  status: string;
  customer_name: string;
  customer_id: string;
  total: number;
  total_quantity: number;
  line_items?: ZohoLineItem[];
  cached_at?: number; // timestamp when this record was cached, used for cache staleness checks
}

/**
 * All fields accepted by the Zoho PUT /salesorders/:id endpoint.
 * Every field is optional — send only what you want to change.
 */
export interface ZohoLineItemUpdate {
  line_item_id?: string;
  item_id?: string;
  name?: string;
  description?: string;
  rate?: number;
  quantity?: number;
  unit?: string;
  tax_id?: string;
  item_total?: number;
  location_id?: string;
  hsn_or_sac?: number;
}

export interface ZohoCreatePayload {
  customer_id: number | string;       // required
  line_items: ZohoLineItemUpdate[];   // required
  salesorder_number?: string;
  date?: string;
  shipment_date?: string;
  reference_number?: string;
  discount?: string;
  is_discount_before_tax?: boolean;
  discount_type?: string;
  delivery_method?: string;
  shipping_charge?: number;
  adjustment?: number;
  adjustment_description?: string;
  pricebook_id?: string | number;
  notes?: string;
  salesperson_name?: string;
  terms?: string;
  exchange_rate?: number;
  location_id?: string;
  place_of_supply?: string;
  gst_treatment?: string;
  gst_no?: string;
  custom_fields?: Array<{
    custom_field_id: string;
    index?: number;
    label?: string;
    value: string;
  }>;
}

export interface ZohoUpdatePayload {
  salesorder_number?: string;
  date?: string;
  shipment_date?: string;
  reference_number?: string;
  customer_id?: number | string;
  discount?: string;
  is_discount_before_tax?: boolean;
  discount_type?: string;
  delivery_method?: string;
  shipping_charge?: number;
  adjustment?: number;
  adjustment_description?: string;
  pricebook_id?: string | number;
  notes?: string;
  salesperson_name?: string;
  terms?: string;
  exchange_rate?: number;
  line_items?: ZohoLineItemUpdate[];
  location_id?: string;
  place_of_supply?: string;
  gst_treatment?: string;
  gst_no?: string;
  custom_fields?: Array<{
    custom_field_id: string;
    index?: number;
    label?: string;
    value: string;
  }>;
}

export interface ZohoListResponse {
  orders: ZohoSalesOrder[];
  totalCount: number;
}

@Injectable()
export class ZohoService {
  private readonly logger = new Logger(ZohoService.name);
  private readonly baseUrl = 'https://www.zohoapis.in/inventory/v1';
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
    return `zoho:orders:index:${date}`;
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

  private async addToDateIndex(date: string, orderId: string): Promise<void> {
    const ids = await this.getIndexForDate(date);
    if (!ids.includes(orderId)) {
      await this.cache.set(this.dayIndexKey(date), [...ids, orderId]);
    }
  }

  async _populateCacheFromList(orders: ZohoSalesOrder[]): Promise<void> {
    // Group IDs by date
    const byDate = new Map<string, string[]>();
    for (const o of orders) {
      const day = o.date.slice(0, 10); // assumes ISO date
      if (!byDate.has(day)) byDate.set(day, []);
      byDate.get(day)!.push(o.salesorder_id);
    }

    await Promise.all([
      // Persist day indexes
      ...[...byDate.entries()].map(([date, ids]) =>
        this.cache.set(this.dayIndexKey(date), ids)
      ),
      // Persist individual orders (list endpoint doesn't have line_items,
      // so only cache if not already cached with richer detail data)
      ...orders.map(async o => {
        const key = `zoho:order:${o.salesorder_id}`;
        const existing = await this.cache.get<CachedEntry<ZohoSalesOrder>>(key);
        if (!existing) {
          await this.cache.set(key, { data: o, cachedAt: Date.now() } satisfies CachedEntry<ZohoSalesOrder>);
        }
      }),
    ]);
  }

  // fetches ALL sales orders for a date range (list endpoint, no line items)
  async listSalesOrders(fromDate: string, toDate: string): Promise<ZohoSalesOrder[]> {
    const dates = this.datesInRange(fromDate, toDate);

    // Check whether every day in the range has a populated index
    const indices = await Promise.all(dates.map(d => this.getIndexForDate(d)));
    const allDaysCached = indices.every(ids => ids.length > 0);
    // ⚠️  "length > 0" is a heuristic — a day with genuinely zero orders will
    //     always miss. You can store a sentinel value like ["__empty__"] for
    //     those days if it becomes a problem.

    if (allDaysCached) {
      this.logger.debug(`Cache HIT  [range] ${fromDate}→${toDate}`);
      const allIds = [...new Set(indices.flat())];
      return this.getSalesOrderDetails(allIds); // uses per-ID cache
    }

    this.logger.debug(`Cache MISS [range] ${fromDate}→${toDate}`);
    const orders = await this._fetchListFromZoho(fromDate, toDate);
    await this._populateCacheFromList(orders);
    return orders;
  }

  async _fetchListFromZoho(fromDate: string, toDate: string): Promise<ZohoSalesOrder[]> {
    this.logger.log(`📋 Fetching Zoho SO list from ${fromDate} to ${toDate}`);
    const client = await this.getClient();
    const allOrders: ZohoSalesOrder[] = [];
    let page = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      try {
        const response = await client.get('/salesorders', {
          params: {
            date_start: fromDate,
            date_end: toDate,
            page,
            per_page: 200,
          },
        });

        const { salesorders, page_context } = response.data;
        allOrders.push(...salesorders);

        hasMorePages = page_context?.has_more_page ?? false;
        page++;

        this.logger.log(`📄 Fetched page ${page - 1}, total so far: ${allOrders.length}`);
      } catch (err) {
        this.handleZohoError(err);
      }
    }

    this.logger.log(`✅ Total Zoho SOs fetched: ${allOrders.length}`);
    return allOrders;
  }

  // fetches full details (including line items) for a single SO
  async getSalesOrderDetail(salesOrderId: string): Promise<ZohoSalesOrder> {
    const cacheKey = `zoho:order:${salesOrderId}`;

    const cached = await this.cache.get<CachedEntry<ZohoSalesOrder>>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache HIT  [detail] ${cacheKey}`);
      return { ...cached.data, cached_at: cached.cachedAt };
    }
    this.logger.debug(`Cache MISS [detail] ${cacheKey}`);

    const client = await this.getClient();
    try {
      const response = await client.get(`/salesorders/${salesOrderId}`);
      const order = response.data.salesorder;

      await this.cache.set(cacheKey, { data: order, cachedAt: Date.now() } satisfies CachedEntry<ZohoSalesOrder>);
      return order;
    } catch (err) {
      this.handleZohoError(err);
    }
  }

  // fetches details for multiple SOs — used during deep check on suspicious days
  async getSalesOrderDetails(salesOrderIds: string[]): Promise<ZohoSalesOrder[]> {
    this.logger.log(`🔍 Fetching details for ${salesOrderIds.length} SOs`);

    const cacheChecks = await Promise.all(
      salesOrderIds.map(id =>
        this.cache.get<CachedEntry<ZohoSalesOrder>>(`zoho:order:${id}`)
      )
    );

    const fresh: ZohoSalesOrder[] = [];
    const missingIds: string[] = [];

    for (let i = 0; i < salesOrderIds.length; i++) {
      const entry = cacheChecks[i];

      if (entry) {
        this.logger.debug(`Cache HIT  [detail] zoho:order:${salesOrderIds[i]}`);
        fresh.push({ ...entry.data, cached_at: entry.cachedAt });
      } else {
        this.logger.debug(`Cache MISS [detail] zoho:order:${salesOrderIds[i]}`);
        missingIds.push(salesOrderIds[i]);
      }
    }

    if (missingIds.length === 0) return fresh;

    const fetched = await this._fetchDetailsFromZoho(missingIds);

    await Promise.all(
      fetched.map(order =>
        this.cache.set(
          `zoho:order:${order.salesorder_id}`,
          { data: order, cachedAt: Date.now() } satisfies CachedEntry<ZohoSalesOrder>,
        )
      )
    );

    const fetchedWithMeta: ZohoSalesOrder[] = fetched.map(order => ({
      ...order,
      cached_at: Date.now(),
    }));

    return [...fresh, ...fetchedWithMeta];
  }

  async _fetchDetailsFromZoho(salesOrderIds: string[]): Promise<ZohoSalesOrder[]> {
    const limit = pLimit(FETCH_CONCURRENCY);
    const results: ZohoSalesOrder[] = [];

    await Promise.all(
      salesOrderIds.map(id =>
        limit(async () => {
          try {
            const detail = await this.getSalesOrderDetail(id);
            if (detail) results.push(detail);
          } catch (err: any) {
            if (err?.type === 'RATE_LIMIT_EXCEEDED') throw err;
            this.logger.warn(`⚠️ Failed to fetch detail for SO ${id}: ${err?.message}`);
          }
        })
      )
    );

    return results;
  }

  //WRITING TO DB

  async createSalesOrder(payload: Partial<ZohoCreatePayload>): Promise<ZohoSalesOrder> {
    this.logger.log(`✏️  Creating Zoho SO`);
    const client = await this.getClient();

    let created: ZohoSalesOrder;
    try {
      const response = await client.post(`/salesorders`, payload);
      created = response.data.salesorder;
    } catch (err) {
      this.handleZohoError(err);
    }

    await this._upsertOrderInCache(created);
    this.logger.log(`✅ SO ${created.salesorder_id} created and cached`);
    return created;
  }

  async updateSalesOrder(
    salesOrderId: string,
    payload: Partial<ZohoUpdatePayload>,
  ): Promise<ZohoSalesOrder> {
    this.logger.log(`✏️  Updating Zoho SO ${salesOrderId}`);
    const client = await this.getClient();

    let updated: ZohoSalesOrder;
    try {
      const response = await client.put(`/salesorders/${salesOrderId}`, payload);
      updated = response.data.salesorder;
    } catch (err) {
      this.handleZohoError(err);
    }

    await this._upsertOrderInCache(updated);
    this.logger.log(`✅ SO ${salesOrderId} updated and cache refreshed`);
    return updated;
  }

  private async _upsertOrderInCache(order: ZohoSalesOrder): Promise<void> {
    const day = order.date.slice(0, 10);
    await Promise.all([
      this.cache.set(`zoho:order:${order.salesorder_id}`, {
        data: order,
        cachedAt: Date.now(),
      } satisfies CachedEntry<ZohoSalesOrder>),
      this.addToDateIndex(day, order.salesorder_id),
    ]);
  }


  // ERROR HANDLING

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