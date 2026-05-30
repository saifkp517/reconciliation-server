import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany, UpdateDateColumn } from 'typeorm';
import { Watchman_Logs } from './watchman-log.entity';
import { CustomerPriceList } from './customer_pricelist.entity';
import { Bill } from '../../bills/entities/bill.entity';

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ nullable: true })
  name!: string;

  @Column({ nullable: true })
  phone!: string;

  @Column({ nullable: true })
  address!: string;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @OneToMany(() => Watchman_Logs, watchmanLog => watchmanLog.customer)
  watchmanLogs!: Watchman_Logs[];

  @OneToMany(() => CustomerPriceList, priceList => priceList.customer)
  priceLists!: CustomerPriceList[];

  @OneToMany(() => Bill, bill => bill.customer)
  bills!: Bill[];

}