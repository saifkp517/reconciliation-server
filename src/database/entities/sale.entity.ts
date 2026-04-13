import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Customer } from './customer.entity';
import { SaleItem } from './sale-item.entity';

@Entity('sales')
export class Sale {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true, nullable: true })
  invoice_no!: string;

  @Column({ nullable: true })
  customer_id!: number;

  @Column({ type: 'date' })
  sale_date!: string;

  @Column({ type: 'numeric', nullable: true })
  total_sp!: number;

  @Column({ type: 'numeric', nullable: true })
  total_cp!: number;

  @Column({ type: 'numeric', nullable: true })
  profit!: number;

  @Column({ type: 'numeric', nullable: true })
  profit_pct!: number;

  @CreateDateColumn()
  created_at!: Date;

  @ManyToOne(() => Customer, customer => customer.sales)
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @OneToMany(() => SaleItem, item => item.sale, { cascade: true })
  items!: SaleItem[];
}