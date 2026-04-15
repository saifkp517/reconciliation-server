import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService, DbSale } from '../database/database.service';
import { ZohoService, ZohoSalesOrder } from '../zoho/zoho.service';

// ---------- result types ----------
export type DayStatus =
  | 'CLEAN'
  | 'COUNT_MISMATCH'
  | 'PRICE_MISMATCH'
  | 'ITEM_MISMATCH'
  | 'RATE_LIMIT_EXCEEDED'
  | 'ERROR';

export interface LineItemDiscrepancy {
  dimension: string;
  db_quantity: number;
  zoho_quantity: number;
  db_unit_sp: number;
  zoho_rate: number;
  db_line_sp: number;
  zoho_item_total: number;
}

export interface MatchedPairResult {
  db_sale_id: number;
  zoho_salesorder_id: string;
  signature: string;
  total_db: number;
  total_zoho: number;
  total_match: boolean;
  discrepancies: LineItemDiscrepancy[];
}

export interface DbRecordSummary {
  db_sale_id: number;
  invoice_no: string;
  customer_name: string;
  line_items: { name: string; quantity: number; unit_sp: number; line_total: number }[];
  total_sp: number;
}

export interface ZohoRecordSummary {
  zoho_salesorder_id: string;
  so_number: string;
  customer_name: string;
  line_items: { name: string; quantity: number; unit_sp: number; line_total: number }[];
  total: number;
}

export interface DayResult {
  date: string;
  status: DayStatus;
  db_count?: number;
  zoho_count?: number;
  db_records?: DbRecordSummary[];
  zoho_records?: ZohoRecordSummary[];
  matched_pairs?: MatchedPairResult[];
  unmatched_db?: number[];
  unmatched_zoho?: string[];
  error?: string;
}

export interface ReconciliationReport {
  from: string;
  to: string;
  generated_at: string;
  summary: {
    total_days: number;
    clean_days: number;
    days_with_issues: number;
  };
  days: DayResult[];
}

// ---------- helpers ----------

const normalize = (s: string) => s.toLowerCase().trim();

function buildDbSignature(sale: DbSale): string {
  return sale.items
    .map(i => `${normalize(i.dimension)}:${i.quantity}`)
    .sort()
    .join('|');
}

function buildZohoSignature(order: ZohoSalesOrder): string {
  return (order.line_items ?? [])
    .map(i => `${normalize(i.name)}:${i.quantity}`)
    .sort()
    .join('|');
}

function dbToSummary(s: DbSale): DbRecordSummary {
  return {
    db_sale_id: s.id,
    invoice_no: s.invoice_no,
    customer_name: s.customer_name,
    line_items: s.items.map(i => ({
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
  };
}

function compareLineItems(dbSale: DbSale, zohoOrder: ZohoSalesOrder): LineItemDiscrepancy[] {
  const discrepancies: LineItemDiscrepancy[] = [];

  const zohoItemMap = new Map<string, { quantity: number; rate: number; item_total: number }>();
  for (const item of zohoOrder.line_items ?? []) {
    zohoItemMap.set(normalize(item.name), {
      quantity: Number(item.quantity),
      rate: Number(item.rate),
      item_total: Number(item.item_total),
    });
  }

  for (const dbItem of dbSale.items) {
    const key = normalize(dbItem.dimension);
    const zohoItem = zohoItemMap.get(key);

    if (!zohoItem) {
      discrepancies.push({
        dimension: dbItem.dimension,
        db_quantity: dbItem.quantity,
        zoho_quantity: 0,
        db_unit_sp: dbItem.unit_sp,
        zoho_rate: 0,
        db_line_sp: dbItem.line_sp,
        zoho_item_total: 0,
      });
      continue;
    }

    if (dbItem.quantity !== zohoItem.quantity || dbItem.unit_sp !== zohoItem.rate) {
      discrepancies.push({
        dimension: dbItem.dimension,
        db_quantity: dbItem.quantity,
        zoho_quantity: zohoItem.quantity,
        db_unit_sp: dbItem.unit_sp,
        zoho_rate: zohoItem.rate,
        db_line_sp: dbItem.line_sp,
        zoho_item_total: zohoItem.item_total,
      });
    }
  }

  return discrepancies;
}

// ---------- service ----------

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private databaseService: DatabaseService,
    private zohoService: ZohoService,
  ) {}

  async reconcile(fromDate: string, toDate: string): Promise<ReconciliationReport> {
    this.logger.log(`🔁 Starting reconciliation from ${fromDate} to ${toDate}`);

    const [dbSales, zohoOrders] = await Promise.all([
      this.databaseService.getSalesWithItems(fromDate, toDate),
      this.zohoService.listSalesOrders(fromDate, toDate),
    ]);

    const dbByDate = this.groupByDate(dbSales, s => s.sale_date);
    const zohoByDate = this.groupByDate(zohoOrders, o => o.date);

    const allDates = Array.from(
      new Set([...Object.keys(dbByDate), ...Object.keys(zohoByDate)]),
    ).sort();

    const dayResults: DayResult[] = [];

    for (const date of allDates) {
      const result = await this.reconcileDay(
        date,
        dbByDate[date] ?? [],
        zohoByDate[date] ?? [],
      );
      dayResults.push(result);

      if (result.status === 'RATE_LIMIT_EXCEEDED') {
        this.logger.warn('⚠️  Rate limit hit, stopping reconciliation early');
        break;
      }
    }

    const cleanDays = dayResults.filter(d => d.status === 'CLEAN').length;

    return {
      from: fromDate,
      to: toDate,
      generated_at: new Date().toISOString(),
      summary: {
        total_days: dayResults.length,
        clean_days: cleanDays,
        days_with_issues: dayResults.length - cleanDays,
      },
      days: dayResults,
    };
  }

  private async reconcileDay(
    date: string,
    dbSales: DbSale[],
    zohoOrders: ZohoSalesOrder[],
  ): Promise<DayResult> {
    this.logger.log(`📅 Reconciling ${date} — DB: ${dbSales.length}, Zoho: ${zohoOrders.length}`);

    // Fetch Zoho line-item details once — needed for both COUNT_MISMATCH and deep compare
    let zohoDetails: ZohoSalesOrder[];
    try {
      zohoDetails = await this.zohoService.getSalesOrderDetails(
        zohoOrders.map(o => o.salesorder_id),
      );
    } catch (err: any) {
      if (err?.type === 'RATE_LIMIT_EXCEEDED') {
        return { date, status: 'RATE_LIMIT_EXCEEDED', error: err.message };
      }
      return { date, status: 'ERROR', error: err?.message ?? 'Failed to fetch Zoho details' };
    }

    // COUNT MISMATCH — return early with summaries on both sides
    if (dbSales.length !== zohoOrders.length) {
      return {
        date,
        status: 'COUNT_MISMATCH',
        db_count: dbSales.length,
        zoho_count: zohoOrders.length,
        db_records: dbSales.map(dbToSummary),
        zoho_records: zohoDetails.map(zohoToSummary),
      };
    }

    // DEEP COMPARE — counts match, check line items and totals
    return this.deepCompare(date, dbSales, zohoDetails);
  }

  private deepCompare(
    date: string,
    dbSales: DbSale[],
    zohoOrders: ZohoSalesOrder[],
  ): DayResult {
    const zohoSignatureMap = new Map<string, ZohoSalesOrder>();
    for (const order of zohoOrders) {
      zohoSignatureMap.set(buildZohoSignature(order), order);
    }

    const matchedPairs: MatchedPairResult[] = [];
    const unmatchedDb: number[] = [];
    const unmatchedZoho = new Set(zohoOrders.map(o => o.salesorder_id));

    for (const dbSale of dbSales) {
      const sig = buildDbSignature(dbSale);
      const zohoMatch = zohoSignatureMap.get(sig);

      if (!zohoMatch) {
        unmatchedDb.push(dbSale.id);
        continue;
      }

      unmatchedZoho.delete(zohoMatch.salesorder_id);

      const discrepancies = compareLineItems(dbSale, zohoMatch);
      const totalDbWithGst = Math.round(dbSale.total_sp * 1.18 * 100) / 100;
      const totalMatch = totalDbWithGst === Number(zohoMatch.total);

      matchedPairs.push({
        db_sale_id: dbSale.id,
        zoho_salesorder_id: zohoMatch.salesorder_id,
        signature: sig,
        total_db: dbSale.total_sp,
        total_zoho: Number(zohoMatch.total),
        total_match: totalMatch,
        discrepancies,
      });
    }

    const hasUnmatched = unmatchedDb.length > 0 || unmatchedZoho.size > 0;
    const hasItemMismatch = matchedPairs.some(p => p.discrepancies.length > 0);
    const hasPriceMismatch = matchedPairs.some(p => !p.total_match);

    const status: DayStatus = hasUnmatched
      ? 'ITEM_MISMATCH'
      : hasItemMismatch || hasPriceMismatch
        ? 'PRICE_MISMATCH'
        : 'CLEAN';

    return {
      date,
      status,
      db_count: dbSales.length,
      zoho_count: zohoOrders.length,
      matched_pairs: matchedPairs,
      unmatched_db: unmatchedDb,
      unmatched_zoho: Array.from(unmatchedZoho),
      db_records: dbSales.map(dbToSummary),
      zoho_records: zohoOrders.map(zohoToSummary),
    };
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