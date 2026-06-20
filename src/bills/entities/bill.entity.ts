import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  AfterLoad,
} from 'typeorm';
import { Customer } from '../../watchmanlogs/entities/customer.entity';
import { BillItem } from './bill-item.entity';

export enum PaymentStatus {
  OUTSTANDING = 'OUTSTANDING',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
}

@Entity('bills')
export class Bill {
  @PrimaryGeneratedColumn()
  id!: number;

  // Virtual field — never stored, computed on load
  invoice_no!: string;

  @Column({ nullable: false })
  customer_id!: number;

  @Column({ type: 'date' })
  bill_date!: string;

  @Column({ type: 'date', nullable: true })
  due_date!: string | null;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.OUTSTANDING,
  })
  payment_status!: PaymentStatus;

  @Column({ type: 'numeric', default: 0 })
  paid_amount!: number;

  @Column({ type: 'date', nullable: true })
  payment_date!: string | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @ManyToOne(() => Customer, customer => customer)
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @OneToMany(() => BillItem, item => item.bill, { cascade: true })
  items!: BillItem[];

  // Virtual field — computed on load from items
  totalAmount!: number;

  @AfterLoad()
  compute() {
    this.invoice_no = `BILL-${this.bill_date?.replace(/-/g, '')}-${String(this.id).padStart(3, '0')}`;
    this.totalAmount = (this.items ?? []).reduce(
      (sum, item) => sum + Number(item.line_sp),
      0,
    );
  }
}