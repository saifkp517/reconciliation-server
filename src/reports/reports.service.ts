import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class ReportsService {
    constructor(private readonly dataSource: DataSource) { }

    async getReportByDateRange(startDate: string, endDate: string) {
        const [salesRows, salesSummary, expenseRows] = await Promise.all([

            // Sales flat rows
            this.dataSource.query(
                `
        SELECT
          s.id                                      AS sale_id,
          s.invoice_no,
          s.sale_date,
          c.name                                    AS customer,
          si.name                                   AS item,
          si.dimension,
          si.quantity,
          si.unit_sp,
          si.line_sp
        FROM sales s
        JOIN customers c   ON c.id = s.customer_id
        JOIN sale_items si ON si.sale_id = s.id
        WHERE s.sale_date >= $1::date
          AND s.sale_date <= $2::date
        ORDER BY s.sale_date, s.id, si.id
        `,
                [startDate, endDate],
            ),

            // Sales summary by customer
            this.dataSource.query(
                `
        SELECT
          c.name                                    AS customer,
          SUM(si.line_sp)                           AS total_revenue
        FROM sales s
        JOIN customers c   ON c.id = s.customer_id
        JOIN sale_items si ON si.sale_id = s.id
        WHERE s.sale_date >= $1::date
          AND s.sale_date <= $2::date
        GROUP BY c.name
        ORDER BY total_revenue DESC
        `,
                [startDate, endDate],
            ),

            // Expenses flat rows
            this.dataSource.query(
                `
        SELECT
          id,
          created_at::date    AS expense_date,
          description,
          amount,
          logged_by
        FROM expenses
        WHERE created_at >= $1::date
          AND created_at < ($2::date + INTERVAL '1 day')
        ORDER BY created_at
        `,
                [startDate, endDate],
            ),

        ]);

        return {
            startDate,
            endDate,
            sales: {
                rows: salesRows,
                summary: salesSummary,
            },
            expenses: {
                rows: expenseRows,
            },
        };
    }
}