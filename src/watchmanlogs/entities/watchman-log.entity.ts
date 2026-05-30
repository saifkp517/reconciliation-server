import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany, JoinColumn, UpdateDateColumn, AfterLoad } from 'typeorm';
import { Customer } from './customer.entity';
import { Watchman_Log_Item } from './watchman-log-items.entity';
import { WatchmanLogTruck } from '../../trucks/entities/watchmanlog-truck.entity';

@Entity('watchman_logs')
export class Watchman_Logs {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true, nullable: true })
  invoice_no!: string;

  @Column({ nullable: true })
  customer_id!: number;

  @Column({ type: 'date' })
  sale_date!: string;

  @CreateDateColumn()
  created_at!: Date;

  @ManyToOne(() => Customer, customer => customer.watchmanLogs)
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @OneToMany(() => WatchmanLogTruck, wlt => wlt.watchmanLog)
  trucks!: WatchmanLogTruck[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => Watchman_Log_Item, item => item.watchman_log, { cascade: true })
  items!: Watchman_Log_Item[];

  totalAmount!: number; // virtual field, no @Column

  @AfterLoad()
  compute() {
    this.totalAmount = (this.items ?? []).reduce(
      (sum, item) => sum + Number(item.line_sp),
      0
    );
    this.invoice_no = `INV-${this.sale_date.replace(/-/g, '')}-${String(this.id).padStart(3, '0')}`;
  }
}