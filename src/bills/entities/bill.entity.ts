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