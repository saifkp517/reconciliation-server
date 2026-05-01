import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ZohoService, ZohoQuote } from '../zoho/zoho.service';
import { SalesService } from '../sales/sales.service';

// ---------- types ----------

const VALID_DIMENSIONS = ["BLOCK 4 inches", "BLOCK 6 inches", "BLOCK 8 inches"];

export interface DbRecordSummary {
  db_sale_id: number;
  invoice_no: string;
  customer_name: string;
  customer_id: number;
  zoho_customer_id: string;
  line_items: { name: string; quantity: number }[];
  dimension_totals: Record<string, number>;
}


export interface ZohoRecordSummary {
  zoho_estimate_id: string;
  estimate_number: string;
  customer_name: string;
  line_items: { name: string; quantity: number; }[];
  dimension_totals: Record<string, number>;
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

// ---------- helpers ----------

function dbToSummary(s: any): DbRecordSummary {
  const line_items = s.items.map((i: any) => ({
    name: i.dimension,
    quantity: i.quantity,
  }));

  const dimension_totals = VALID_DIMENSIONS.reduce((acc, dim) => {
    acc[dim] = 0;
    return acc;
  }, {} as Record<string, number>);

  line_items.forEach(i => {
    if (dimension_totals[i.name] !== undefined) {
      dimension_totals[i.name] += i.quantity;
    }
  });

  return {
    db_sale_id: s.id,
    invoice_no: s.invoice_no,
    customer_name: s.customer_name,
    customer_id: s.customer_id,
    zoho_customer_id: s.zoho_customer_id,
    line_items,
    dimension_totals
  };
}

function zohoToSummary(q: ZohoQuote): ZohoRecordSummary {
  const line_items = (q.line_items ?? []).map(i => ({
    name: i.name,
    quantity: Number(i.quantity),
    line_total: Number(i.item_total),
  }));

  const dimension_totals = VALID_DIMENSIONS.reduce((acc, dim) => {
    acc[dim] = 0;
    return acc;
  }, {} as Record<string, number>);

  line_items.forEach(i => {
    if (dimension_totals[i.name] !== undefined) {
      dimension_totals[i.name] += i.quantity;
    }
  });

  return {
    zoho_estimate_id: q.estimate_id,
    estimate_number: q.estimate_number,
    customer_name: q.customer_name,
    line_items,
    dimension_totals,
    cached_at: q.cached_at,
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

  async reconcileListing(fromDate: string, toDate: string): Promise<ReconciliationReport> {
    this.logger.log(`📦 Fetching records from ${fromDate} to ${toDate}`);

    const [dbSales, zohoQuotes] = await Promise.all([
      this.databaseService.getSalesWithItems(fromDate, toDate),
      this.zohoService.listQuotes(fromDate, toDate),
    ]);


    const hydratedZohoQuotes = await Promise.all(
      zohoQuotes.map(async (quote) => {
        if (quote.line_items && quote.line_items.length > 0) return quote; // already has items (e.g. from cache)
        try {
          const detail = await this.zohoService.getQuoteDetail(quote.estimate_id);
          return { ...quote, line_items: detail.line_items };
        } catch (err: any) {
          this.logger.warn(`⚠️ Could not hydrate line items for ${quote.estimate_id}: ${err?.message}`);
          return quote; // fall back to empty, don't crash the whole report
        }
      })
    );

    const dbByDate = this.groupByDate(dbSales, s => s.sale_date);
    const zohoByDate = this.groupByDate(hydratedZohoQuotes, q => q.date);

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

  async commit(payload: { date: string; db_records: CommitDbRecord[] }): Promise<{
    date: string;
    db: { updated: number[]; failed: { id: number; error: string }[] };
  }> {
    this.logger.log(`💾 Committing reconciled DB records for ${payload.date}`);

    // reject any DB records without an ID
    const missingIds = payload.db_records.filter(r => !r.id);
    if (missingIds.length > 0) {
      throw new BadRequestException(
        'All DB records must have an ID. New DB records must be created through the sales flow.',
      );
    }

    const result = {
      date: payload.date,
      db: { updated: [] as number[], failed: [] as { id: number; error: string }[] },
    };

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