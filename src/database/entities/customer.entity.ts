import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { Sale } from './sale.entity';

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ nullable: true})
  name!: string;

  @Column({ nullable: true })
  phone!: string;

  @Column({ unique: true, nullable: true })
  zoho_id!: string;

  @CreateDateColumn()
  created_at!: Date;

  @OneToMany(() => Sale, sale => sale.customer)
  sales!: Sale[];
}