import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { ExpenseLogItem } from './expense-log-item.entity';

@Entity('expense_logs')
export class ExpenseLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'date', name: 'date' })
  date!: string;

  @Column({ type: 'varchar', name: 'submitted_by' })
  submittedBy!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @OneToMany(() => ExpenseLogItem, item => item.expenseLog, { cascade: true })
  items!: ExpenseLogItem[];
}
