import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ZohoService, ZohoSalesOrder } from '../zoho/zoho.service';
import { SalesService } from '../sales/sales.service';

// ---------- types ----------

export interface DbRecordSummary {
  db_sale_id: number;
  invoice_no: string;
  customer_name: string;

  customer_id: number;        // DB FK
  zoho_customer_id: string;   // customers.zoho_id

  line_items: { name: string; quantity: number; unit_sp: number; line_total: number }[];
  total_sp: number;
}

export interface ZohoRecordSummary {
  zoho_salesorder_id: string;
  so_number: string;
  customer_name: string;
  line_items: { name: string; quantity: number; unit_sp: number; line_total: number }[];
  total: number;
  cached_at?: number;
}

export interface DayResult {
  date: string;
  db_records: DbRecordSummary[];
  zoho_records: ZohoRecordSummary[];
}

export interface ReconciliationReport {
  from: string;
  to: string;
  generated_at: string;
  days: DayResult[];
}

export interface CommitDbRecord {
  id: number; // required — no ID = rejected
  customer_id: number;
  sale_date: string;
  items: { dimension: string; quantity: number }[];
}

export interface CommitZohoRecord {
  zoho_salesorder_id?: string; // present = update, absent = create
  customer_id: number | string;
  date: string;
  line_items: {
    line_item_id?: string;
    item_id?: string;
    name: string;
    quantity: number;
    rate: number;
  }[];
}

export interface CommitPayload {
  date: string;
  db_records: CommitDbRecord[];
  zoho_records: CommitZohoRecord[];
}

export interface CommitResult {
  date: string;
  db: {
    updated: number[];   // sale ids successfully updated
    failed: { id: number; error: string }[];
  };
  zoho: {
    updated: string[];   // zoho salesorder ids successfully updated
    created: string[];   // zoho salesorder ids successfully created
    failed: { record: CommitZohoRecord; error: string }[];
  };
}

// ---------- helpers ----------

function dbToSummary(s: any): DbRecordSummary {
  return {
    db_sale_id: s.id,
    invoice_no: s.invoice_no,
    customer_name: s.customer_name,
    customer_id: s.customer_id,
    zoho_customer_id: s.zoho_customer_id,
    line_items: s.items.map((i: any) => ({
      name: i.dimension,
      quantity: i.quantity,
      unit_sp: i.unit_sp,
      line_total: i.line_sp,
    })),
    total_sp: s.total_sp,
  };
}

function zohoToSummary(o: ZohoSalesOrder): ZohoRecordSummary {
  return {
    zoho_salesorder_id: o.salesorder_id,
    so_number: o.salesorder_number,
    customer_name: o.customer_name,
    line_items: (o.line_items ?? []).map(i => ({
      name: i.name,
      quantity: Number(i.quantity),
      unit_sp: Number(i.rate),
      line_total: Number(i.item_total),
    })),
    total: Number(o.total),
    cached_at: o.cached_at,
  };
}

// ---------- service ----------

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private databaseService: DatabaseService,
    private zohoService: ZohoService,
    private salesService: SalesService,
  ) { }

  async reconcile(fromDate: string, toDate: string): Promise<ReconciliationReport> {
    this.logger.log(`📦 Fetching records from ${fromDate} to ${toDate}`);

    const [dbSales, zohoOrders] = await Promise.all([
      this.databaseService.getSalesWithItems(fromDate, toDate),
      this.zohoService.listSalesOrders(fromDate, toDate),
    ]);


    const hydratedZohoOrders = await Promise.all(
      zohoOrders.map(async (order) => {
        if (order.line_items && order.line_items.length > 0) return order; // already has items (e.g. from cache)
        try {
          const detail = await this.zohoService.getSalesOrderDetail(order.salesorder_id);
          return { ...order, line_items: detail.line_items };
        } catch (err: any) {
          this.logger.warn(`⚠️ Could not hydrate line items for ${order.salesorder_id}: ${err?.message}`);
          return order; // fall back to empty, don't crash the whole report
        }
      })
    );

    const dbByDate = this.groupByDate(dbSales, s => s.sale_date);
    const zohoByDate = this.groupByDate(hydratedZohoOrders, o => o.date);


    const allDates = Array.from(
      new Set([...Object.keys(dbByDate), ...Object.keys(zohoByDate)]),
    ).sort();

    const days: DayResult[] = allDates.map(date => ({
      date,
      db_records: (dbByDate[date] ?? []).map(dbToSummary),
      zoho_records: (zohoByDate[date] ?? []).map(zohoToSummary),
    }));

    return {
      from: fromDate,
      to: toDate,
      generated_at: new Date().toISOString(),
      days,
    };
  }

  async commit(payload: CommitPayload): Promise<CommitResult> {
    this.logger.log(`💾 Committing reconciled records for ${payload.date}`);

    // reject any DB records without an ID
    const missingIds = payload.db_records.filter(r => !r.id);
    if (missingIds.length > 0) {
      throw new BadRequestException(
        'All DB records must have an ID. New DB records must be created through the sales flow.',
      );
    }

    const result: CommitResult = {
      date: payload.date,
      db: { updated: [], failed: [] },
      zoho: { updated: [], created: [], failed: [] },
    };

    // --- DB: update only ---
    for (const record of payload.db_records) {
      try {
        await this.salesService.updateSale(record.id, {
          customer_id: record.customer_id,
          sale_date: record.sale_date,
          items: record.items,
        });
        result.db.updated.push(record.id);
        this.logger.log(`✅ DB sale ${record.id} updated`);
      } catch (err: any) {
        this.logger.error(`❌ Failed to update DB sale ${record.id}: ${err?.message}`);
        result.db.failed.push({ id: record.id, error: err?.message ?? 'Unknown error' });
      }
    }


    // --- Zoho: update or create ---
    for (const record of payload.zoho_records) {

      this.logger.error(
        `DEBUG Zoho create payload: customer_id=${record.customer_id}, type=${typeof record.customer_id}`
      );

      try {
        if (record.zoho_salesorder_id) {
          // update
          await this.zohoService.updateSalesOrder(record.zoho_salesorder_id, {
            date: record.date,
            customer_id: record.customer_id,
            line_items: record.line_items,
          });
          result.zoho.updated.push(record.zoho_salesorder_id);
          this.logger.log(`✅ Zoho SO ${record.zoho_salesorder_id} updated`);
        } else {
          // create



          const created = await this.zohoService.createSalesOrder({
            customer_id: record.customer_id,
            date: record.date,
            line_items: record.line_items,
          });
          result.zoho.created.push(created.salesorder_id);
          this.logger.log(`✅ Zoho SO ${created.salesorder_id} created`);
        }
      } catch (err: any) {
        this.logger.error(`❌ Failed to process Zoho record: ${err?.message}`);
        result.zoho.failed.push({ record, error: err?.message ?? 'Unknown error' });
      }
    }

    return result;
  }

  private groupByDate<T>(items: T[], getDate: (item: T) => string): Record<string, T[]> {
    return items.reduce((acc, item) => {
      const date = new Date(getDate(item)).toISOString().split('T')[0];
      acc[date] = acc[date] ?? [];
      acc[date].push(item);
      return acc;
    }, {} as Record<string, T[]>);
  }
}