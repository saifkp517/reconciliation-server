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

  @Column({ nullable: true })
  invoice_no!: string;

  @Column({ nullable: true })
  fiscal_seq!: number;

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

  @Column({ type: 'text', nullable: true })
  billing_address!: string | null;

  @Column({ type: 'varchar', nullable: true })
  billing_city!: string | null;

  @Column({ type: 'varchar', nullable: true })
  billing_state!: string | null;

  @Column({ type: 'varchar', nullable: true })
  billing_pincode!: string | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @ManyToOne(() => Customer, customer => customer)
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @OneToMany(() => BillItem, item => item.bill, { cascade: true })
  items!: BillItem[];

  totalAmount!: number;

  @AfterLoad()
  compute() {
    this.totalAmount = (this.items ?? []).reduce(
      (sum, item) => sum + Number(item.line_sp),
      0,
    );
  }
}
