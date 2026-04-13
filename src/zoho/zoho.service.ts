import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import axios, { AxiosInstance } from 'axios';

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

  // fetches ALL sales orders for a date range (list endpoint, no line items)
  async listSalesOrders(fromDate: string, toDate: string): Promise<ZohoSalesOrder[]> {
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
            per_page: 200, // max allowed by Zoho
          },
        });

        const { salesorders, page_context } = response.data;
        allOrders.push(...salesorders);

        // Zoho tells us if there are more pages
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
    this.logger.log(`🔍 Fetching Zoho SO detail for ${salesOrderId}`);
    const client = await this.getClient();

    try {
      const response = await client.get(`/salesorders/${salesOrderId}`);
      return response.data.salesorder;
    } catch (err) {
      this.handleZohoError(err);
    }
  }

  // fetches details for multiple SOs — used during deep check on suspicious days
  async getSalesOrderDetails(salesOrderIds: string[]): Promise<ZohoSalesOrder[]> {
    this.logger.log(`🔍 Fetching details for ${salesOrderIds.length} suspicious SOs`);
    const results: ZohoSalesOrder[] = [];

    for (const id of salesOrderIds) {
      try {
        const detail = await this.getSalesOrderDetail(id);
        if (detail) results.push(detail);  // guard against undefined
      } catch (err: any) {
        if (err?.type === 'RATE_LIMIT_EXCEEDED') throw err; // bubble up rate limit
        this.logger.warn(`⚠️ Failed to fetch detail for SO ${id}: ${err?.message}`);
      }
    }

    return results;
  }

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