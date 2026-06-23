import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  RelationId,
} from 'typeorm';
import { Bill } from './bill.entity';

@Entity('bill_payments')
export class BillPayment {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Bill, bill => bill.payments, { nullable: false })
  @JoinColumn({ name: 'bill_id' })
  bill!: Bill;

  @RelationId((p: BillPayment) => p.bill)
  bill_id!: number;

  @Column({ type: 'numeric', nullable: false })
  amount!: number;

  @Column({ type: 'date', nullable: false })
  payment_date!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn()
  created_at!: Date;
}
