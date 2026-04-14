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
  signature: string; // the key we matched on
  total_db: number;
  total_zoho: number;
  total_match: boolean;
  discrepancies: LineItemDiscrepancy[];
}

// Summary records surfaced on COUNT_MISMATCH (no line-item fetch needed)
export interface DbRecordSummary {
  db_sale_id: number;
  invoice_no: string;
  customer_name: string;
  items_summary: string;   // e.g. "6in × 138, 8in × 28"
  total_sp: number;
}

export interface ZohoRecordSummary {
  zoho_salesorder_id: string;
  so_number: string;
  customer_name: string;
  line_items: { name: string; quantity: number }[];
  total: number;
}

export interface DayResult {
  date: string;
  status: DayStatus;
  db_count?: number;
  zoho_count?: number;
  // populated on COUNT_MISMATCH so the caller can show which records exist on each side
  db_records?: DbRecordSummary[];
  zoho_records?: ZohoRecordSummary[];
  matched_pairs?: MatchedPairResult[];
  unmatched_db?: number[];       // db sale ids with no zoho match
  unmatched_zoho?: string[];     // zoho so ids with no db match
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

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private databaseService: DatabaseService,
    private zohoService: ZohoService,
  ) { }

  async reconcile(fromDate: string, toDate: string): Promise<ReconciliationReport> {
    this.logger.log(`🔁 Starting reconciliation from ${fromDate} to ${toDate}`);

    // fetch everything in parallel
    const [dbSales, zohoOrders] = await Promise.all([
      this.databaseService.getSalesWithItems(fromDate, toDate),
      this.zohoService.listSalesOrders(fromDate, toDate),
    ]);

    // group both by date
    const dbByDate = this.groupDbByDate(dbSales);
    const zohoByDate = this.groupZohoByDate(zohoOrders);

    // get all unique dates across both sources
    const allDates = Array.from(
      new Set([...Object.keys(dbByDate), ...Object.keys(zohoByDate)]),
    ).sort();

    const dayResults: DayResult[] = [];

    for (const date of allDates) {
      const result = await this.reconcileDay(
        date,
        dbByDate[date] || [],
        zohoByDate[date] || [],
      );
      dayResults.push(result);

      // if we hit rate limit, stop processing further days
      if (result.status === 'RATE_LIMIT_EXCEEDED') {
        this.logger.warn('⚠️ Rate limit hit, stopping reconciliation early');
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

    // PHASE 1 — COUNT CHECK

    const zohoDetails = await this.zohoService.getSalesOrderDetails(
      zohoOrders.map(o => o.salesorder_id),
    );

    const zohoDetailMap = new Map(zohoDetails.map(o => [o.salesorder_id, o]));

    if (dbSales.length !== zohoOrders.length) {
      return {
        date,
        status: 'COUNT_MISMATCH',
        db_count: dbSales.length,
        zoho_count: zohoOrders.length,
        db_records: dbSales.map(s => ({
          db_sale_id: s.id,
          invoice_no: s.invoice_no,
          customer_name: s.customer_name,
          items_summary: [
            s.qty_4in != null ? `4in × ${s.qty_4in}` : null,
            s.qty_6in != null ? `6in × ${s.qty_6in}` : null,
            s.qty_8in != null ? `8in × ${s.qty_8in}` : null,
          ].filter(Boolean).join(', '),
          total_sp: Number(s.total_sp),
        })),
        zoho_records: zohoOrders.map(o => {
          const detail = zohoDetailMap.get(o.salesorder_id);
          return {
            zoho_salesorder_id: o.salesorder_id,
            so_number: o.salesorder_number,
            customer_name: o.customer_name,
            line_items: (detail?.line_items ?? []).map(i => ({
              name: i.name,
              quantity: i.quantity,
            })),
            total: Number(o.total)
          };
        }),
      };
    }

    // PHASE 3 — DEEP CHECK (fetch line items for all SOs on this suspicious day)
    this.logger.log(`🔎 Suspicious day ${date}, fetching line item details...`);

    try {
      const zohoDetails = await this.zohoService.getSalesOrderDetails(
        zohoOrders.map(o => o.salesorder_id),
      );

      return this.deepCompare(date, dbSales, zohoDetails);
    } catch (err: any) {
      if (err?.type === 'RATE_LIMIT_EXCEEDED') {
        return { date, status: 'RATE_LIMIT_EXCEEDED', error: err.message };
      }
      return { date, status: 'ERROR', error: err?.message || 'Unknown error during deep check' };
    }
  }

  private deepCompare(
    date: string,
    dbSales: DbSale[],
    zohoOrders: ZohoSalesOrder[],
  ): DayResult {
    // build signature map for zoho orders
    // signature = sorted "name:qty" pairs joined
    const zohoSignatureMap = new Map<string, ZohoSalesOrder>();
    for (const order of zohoOrders) {
      const sig = this.buildZohoSignature(order);
      zohoSignatureMap.set(sig, order);
    }

    const matchedPairs: MatchedPairResult[] = [];
    const unmatchedDb: number[] = [];
    const unmatchedZoho = new Set(zohoOrders.map(o => o.salesorder_id));

    for (const dbSale of dbSales) {
      const sig = this.buildDbSignature(dbSale);
      const zohoMatch = zohoSignatureMap.get(sig);

      if (!zohoMatch) {
        unmatchedDb.push(dbSale.id);
        continue;
      }

      unmatchedZoho.delete(zohoMatch.salesorder_id);

      // compare line items on matched pair
      const discrepancies = this.compareLineItems(dbSale, zohoMatch);

      const db_total_with_gst = Math.round(Number(dbSale.total_sp) * 1.18 * 100) / 100;

      matchedPairs.push({
        db_sale_id: dbSale.id,
        zoho_salesorder_id: zohoMatch.salesorder_id,
        signature: sig,
        total_db: Number(dbSale.total_sp),
        total_zoho: Number(zohoMatch.total),
        total_match: Number(db_total_with_gst) === Number(zohoMatch.total),
        discrepancies,
      });
    }

    const hasItemMismatch = matchedPairs.some(p => p.discrepancies.length > 0);
    const hasPriceMismatch = matchedPairs.some(p => !p.total_match);

    return {
      date,
      status: unmatchedDb.length > 0 || unmatchedZoho.size > 0
        ? 'ITEM_MISMATCH'
        : hasItemMismatch || hasPriceMismatch
          ? 'PRICE_MISMATCH'
          : 'CLEAN',
      db_count: dbSales.length,
      zoho_count: zohoOrders.length,
      matched_pairs: matchedPairs,
      unmatched_db: unmatchedDb,
      unmatched_zoho: Array.from(unmatchedZoho),
    };
  }

  private compareLineItems(dbSale: DbSale, zohoOrder: ZohoSalesOrder): LineItemDiscrepancy[] {
    const discrepancies: LineItemDiscrepancy[] = [];

    const dimensions = [
      { dim: '4 inches', db_qty: dbSale.qty_4in, db_rate: dbSale.unit_sp_4in },
      { dim: '6 inches', db_qty: dbSale.qty_6in, db_rate: dbSale.unit_sp_6in },
      { dim: '8 inches', db_qty: dbSale.qty_8in, db_rate: dbSale.unit_sp_8in },
    ];

    const zohoItemMap = new Map<string, { quantity: number; rate: number; item_total: number }>();
    for (const item of zohoOrder.line_items ?? []) {
      zohoItemMap.set(item.name.toLowerCase().trim(), {
        quantity: item.quantity,
        rate: item.rate,
        item_total: item.item_total,
      });
    }

    for (const { dim, db_qty, db_rate } of dimensions) {
      if (db_qty == null) continue; // dimension not in this sale

      const zohoItem = zohoItemMap.get(dim);

      if (!zohoItem) {
        discrepancies.push({
          dimension: dim,
          db_quantity: db_qty,
          zoho_quantity: 0,
          db_unit_sp: db_rate ?? 0,
          zoho_rate: 0,
          db_line_sp: 0,
          zoho_item_total: 0,
        });
        continue;
      }

      if (db_qty !== zohoItem.quantity || Number(db_rate) !== Number(zohoItem.rate)) {
        discrepancies.push({
          dimension: dim,
          db_quantity: db_qty,
          zoho_quantity: zohoItem.quantity,
          db_unit_sp: db_rate ?? 0,
          zoho_rate: zohoItem.rate,
          db_line_sp: 0,
          zoho_item_total: zohoItem.item_total,
        });
      }
    }

    return discrepancies;
  }

  // ---------- helpers ----------

  private buildDbSignature(sale: DbSale): string {
    const parts: string[] = [];
    if (sale.qty_4in != null) parts.push(`4 inches:${sale.qty_4in}`);
    if (sale.qty_6in != null) parts.push(`6 inches:${sale.qty_6in}`);
    if (sale.qty_8in != null) parts.push(`8 inches:${sale.qty_8in}`);
    return parts.sort().join('|');
  }


  private buildZohoSignature(order: ZohoSalesOrder): string {
    return (order.line_items || [])
      .map(i => `${i.name.toLowerCase().trim()}:${i.quantity}`)
      .sort()
      .join('|');
  }

  private groupDbByDate(sales: any[]): Record<string, any[]> {
    return sales.reduce((acc, sale) => {
      const date = new Date(sale.sale_date).toISOString().split('T')[0];
      acc[date] = acc[date] || [];
      acc[date].push(sale);
      return acc;
    }, {} as Record<string, any[]>);
  }

  private groupZohoByDate(orders: ZohoSalesOrder[]): Record<string, ZohoSalesOrder[]> {
    return orders.reduce((acc, order) => {
      acc[order.date] = acc[order.date] || [];
      acc[order.date].push(order);
      return acc;
    }, {} as Record<string, ZohoSalesOrder[]>);
  }
}