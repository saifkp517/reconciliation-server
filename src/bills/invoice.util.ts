import { EntityManager } from 'typeorm';

export const COMPANY_PREFIX = 'SC';

export function getFiscalYear(dateStr: string): string {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const startYear = month >= 4 ? year : year - 1;
  return `${String(startYear).slice(2)}-${String(startYear + 1).slice(2)}`;
}

export async function nextInvoiceSeq(manager: EntityManager, docType: string, fiscalYear: string): Promise<number> {
  const result = await manager.query(
    `INSERT INTO invoice_sequences (doc_type, fiscal_year, current_seq)
     VALUES ($1, $2, 1)
     ON CONFLICT (doc_type, fiscal_year)
     DO UPDATE SET current_seq = invoice_sequences.current_seq + 1
     RETURNING current_seq`,
    [docType, fiscalYear],
  );
  return result[0].current_seq as number;
}
