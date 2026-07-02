import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ExpenseLog } from './expense-log.entity';

export enum ExpenseItemCategory {
  RAW_MATERIAL = 'raw_material',
  LABOR        = 'labor',
  EXPENSE      = 'expense',
}

@Entity('expense_log_items')
export class ExpenseLogItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'expense_log_id' })
  expenseLogId!: number;

  @ManyToOne(() => ExpenseLog, log => log.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'expense_log_id' })
  expenseLog!: ExpenseLog;

  @Column({ type: 'varchar' })
  description!: string;

  @Column({ type: 'numeric', precision: 12, scale: 3 })
  quantity!: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, name: 'unit_price' })
  unitPrice!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'total_amount' })
  totalAmount!: number;

  @Column({ type: 'enum', enum: ExpenseItemCategory, nullable: true })
  category!: ExpenseItemCategory | null;

  @Column({ type: 'boolean', default: false, name: 'is_verified' })
  isVerified!: boolean;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}
