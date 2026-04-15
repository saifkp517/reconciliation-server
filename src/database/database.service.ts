import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Sale } from './entities/sale.entity';

export interface DbSale {
  id: number;
  invoice_no: string;
  sale_date: string;
  customer_name: string;
  items: { dimension: string; quantity: number; unit_sp: number; line_sp: number }[];
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

  async getSalesWithItems(fromDate: string, toDate: string): Promise<DbSale[]> {
    const rows = await this.saleRepository.query(`
    SELECT
      s.id            AS "id",
      s.sale_date     AS "sale_date",
      s.invoice_no    AS "invoice_no",
      c.name          AS "customer_name",
      s.total_sp      AS "total_sp",
      s.total_cp      AS "total_cp",
      s.profit        AS "profit",
      s.profit_pct    AS "profit_pct",
      si.dimension    AS "dimension",
      si.quantity     AS "quantity",
      si.unit_sp      AS "unit_sp",
      si.line_sp      AS "line_sp"
    FROM sales s
    JOIN customers c   ON c.id = s.customer_id
    JOIN sale_items si ON si.sale_id = s.id
    WHERE s.sale_date BETWEEN $1 AND $2
    ORDER BY s.sale_date, s.invoice_no
  `, [fromDate, toDate]);

    // Group rows by sale id
    const saleMap = new Map<number, DbSale>();
    for (const row of rows) {
      if (!saleMap.has(row.id)) {
        saleMap.set(row.id, {
          id: Number(row.id),
          sale_date: row.sale_date,
          invoice_no: row.invoice_no,
          customer_name: row.customer_name,
          total_sp: Number(row.total_sp),
          total_cp: Number(row.total_cp),
          profit: Number(row.profit),
          profit_pct: Number(row.profit_pct),
          items: [],
        });
      }
      saleMap.get(row.id)!.items.push({
        dimension: row.dimension,
        quantity: Number(row.quantity),
        unit_sp: Number(row.unit_sp ?? 0),
        line_sp: Number(row.line_sp ?? 0),
      });
    }

    return Array.from(saleMap.values());
  }

  // generic raw query escape hatch if ever needed
  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    return this.saleRepository.query(sql, params);
  }
}