import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany, UpdateDateColumn } from 'typeorm';
import { Sale } from './sale.entity';
import { CustomerPriceList } from './customer_pricelist.entity';

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

  @OneToMany(() => Sale, sale => sale.customer)
  sales!: Sale[];

  @OneToMany(() => CustomerPriceList, priceList => priceList.customer)
  priceLists!: CustomerPriceList[];
}