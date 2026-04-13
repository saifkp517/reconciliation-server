import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Sale } from './entities/sale.entity';

export interface DbSale {
  id: number;
  invoice_no: string;
  sale_date: string;
  customer_name: string;
  qty_4in: number | null;
  unit_sp_4in: number | null;
  qty_6in: number | null;
  unit_sp_6in: number | null;
  qty_8in: number | null;
  unit_sp_8in: number | null;
  total_sp: number;
  total_cp: number;
  profit: number;
  profit_pct: number;
}

export interface DbSaleItem {
  id: number;
  dimension: string;
  quantity: number;
  unit_sp: number;
  line_sp: number;
}

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(
    @InjectRepository(Sale)
    private saleRepository: Repository<Sale>,
  ) { }

  async getSalesCountByDate(fromDate: string, toDate: string): Promise<Record<string, number>> {
    const sales = await this.saleRepository
      .createQueryBuilder('sale')
      .select('sale.sale_date::text', 'sale_date')
      .addSelect('COUNT(*)', 'count')
      .where('sale.sale_date BETWEEN :from AND :to', { from: fromDate, to: toDate })
      .groupBy('sale.sale_date')
      .orderBy('sale.sale_date')
      .getRawMany();

    return sales.reduce((acc, row) => {
      acc[row.sale_date] = parseInt(row.count);
      return acc;
    }, {} as Record<string, number>);
  }

  async getSalesWithItems(fromDate: string, toDate: string): Promise<any[]> {
    const sales = await this.saleRepository.query(
      `
    SELECT
      s.sale_date                                                             AS "Date",
      s.invoice_no                                                            AS "invoice_no",
      c.name                                                                  AS "customer_name",

      MAX(CASE WHEN si.dimension = '4 inches' THEN si.quantity END)          AS "qty_4in",
      MAX(CASE WHEN si.dimension = '4 inches' THEN si.unit_sp END)           AS "unit_sp_4in",

      MAX(CASE WHEN si.dimension = '6 inches' THEN si.quantity END)          AS "qty_6in",
      MAX(CASE WHEN si.dimension = '6 inches' THEN si.unit_sp END)           AS "unit_sp_6in",

      MAX(CASE WHEN si.dimension = '8 inches' THEN si.quantity END)          AS "qty_8in",
      MAX(CASE WHEN si.dimension = '8 inches' THEN si.unit_sp END)           AS "unit_sp_8in",

      MAX(CASE WHEN si.dimension = '4 inches' THEN si.unit_cp END)           AS "unit_cp_4in",
      MAX(CASE WHEN si.dimension = '6 inches' THEN si.unit_cp END)           AS "unit_cp_6in",
      MAX(CASE WHEN si.dimension = '8 inches' THEN si.unit_cp END)           AS "unit_cp_8in",

      SUM(si.line_sp)                                                         AS "check_line_sp",

      s.total_sp                                                              AS "total_sp",
      s.total_cp                                                              AS "total_cp",
      s.profit                                                                AS "profit",
      s.profit - 1500                                                         AS "profit_summary",
      s.profit_pct                                                            AS "profit_pct"

    FROM sales s
    JOIN customers c   ON c.id = s.customer_id
    JOIN sale_items si ON si.sale_id = s.id

    WHERE s.sale_date BETWEEN $1 AND $2

    GROUP BY
      s.id, s.sale_date, s.invoice_no, c.name,
      s.total_sp, s.total_cp, s.profit, s.profit_pct

    ORDER BY s.sale_date, s.invoice_no
    `,
      [fromDate, toDate],
    );

    return sales.map((row: any) => ({
      sale_date: row.Date,
      invoice_no: row.invoice_no,
      customer_name: row.customer_name,

      qty_4in: row.qty_4in != null ? Number(row.qty_4in) : null,
      unit_sp_4in: row.unit_sp_4in != null ? Number(row.unit_sp_4in) : null,

      qty_6in: row.qty_6in != null ? Number(row.qty_6in) : null,
      unit_sp_6in: row.unit_sp_6in != null ? Number(row.unit_sp_6in) : null,

      qty_8in: row.qty_8in != null ? Number(row.qty_8in) : null,
      unit_sp_8in: row.unit_sp_8in != null ? Number(row.unit_sp_8in) : null,

      unit_cp_4in: row.unit_cp_4in != null ? Number(row.unit_cp_4in) : null,
      unit_cp_6in: row.unit_cp_6in != null ? Number(row.unit_cp_6in) : null,
      unit_cp_8in: row.unit_cp_8in != null ? Number(row.unit_cp_8in) : null,

      check_line_sp: Number(row.check_line_sp),

      total_sp: Number(row.total_sp),
      total_cp: Number(row.total_cp),
      profit: Number(row.profit),
      profit_summary: Number(row.profit_summary),
      profit_pct: Number(row.profit_pct),
    }));
  }

  // generic raw query escape hatch if ever needed
  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    return this.saleRepository.query(sql, params);
  }
}