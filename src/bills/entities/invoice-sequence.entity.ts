import { Entity, PrimaryColumn, Column } from 'typeorm';

// Tracks per-fiscal-year invoice counters for each document type.
// One row per (doc_type, fiscal_year) — never resets, new fiscal year = new row starting at 1.
@Entity('invoice_sequences')
export class InvoiceSequence {
  @PrimaryColumn({ length: 10 })
  doc_type!: string; // 'SL' | 'WL'

  @PrimaryColumn({ length: 7 })
  fiscal_year!: string; // e.g. '26-27'

  @Column({ default: 0 })
  current_seq!: number;
}
