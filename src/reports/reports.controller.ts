import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { DatabaseService } from '../database/database.service';
import * as ExcelJS from 'exceljs';

@Controller('reports')
export class ReportsController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Get('fy-report/export')
  async exportFyReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Res() res,
  ) {
    const data = await this.databaseService.getSalesWithItems(
      startDate,
      endDate,
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('FY Report');

    // Define columns (aligned to your backend shape)
    sheet.columns = [
      { header: 'Sale Date', key: 'sale_date', width: 15 },
      { header: 'Invoice No', key: 'invoice_no', width: 20 },
      { header: 'Customer Name', key: 'customer_name', width: 25 },

      { header: 'Qty 4in', key: 'qty_4in', width: 10 },
      { header: 'SP 4in', key: 'unit_sp_4in', width: 12 },

      { header: 'Qty 6in', key: 'qty_6in', width: 10 },
      { header: 'SP 6in', key: 'unit_sp_6in', width: 12 },

      { header: 'Qty 8in', key: 'qty_8in', width: 10 },
      { header: 'SP 8in', key: 'unit_sp_8in', width: 12 },

      { header: 'CP 4in', key: 'unit_cp_4in', width: 12 },
      { header: 'CP 6in', key: 'unit_cp_6in', width: 12 },
      { header: 'CP 8in', key: 'unit_cp_8in', width: 12 },

      { header: 'Total SP', key: 'total_sp', width: 15 },
      { header: 'Total CP', key: 'total_cp', width: 15 },
      { header: 'Profit', key: 'profit', width: 15 },
      { header: 'Profit %', key: 'profit_pct', width: 12 },
    ];

    // Add rows
    data.forEach((row) => {
      sheet.addRow(row);
    });

    // Optional: formatting
    sheet.getRow(1).font = { bold: true };

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=fy-report.xlsx`,
    );

    await workbook.xlsx.write(res);
    res.end();
  }
}