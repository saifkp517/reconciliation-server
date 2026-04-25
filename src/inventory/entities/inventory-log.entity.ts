// entities/inventory-log.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, OneToMany,
  JoinColumn,
  OneToOne,
} from 'typeorm';
import { InventoryLogItem } from './inventory-log-item.entity';
import { Sale } from '../../sales/entities/sale.entity';

export type TransactionType = 'PRODUCTION' | 'DELIVERY' | 'PURCHASE' | 'ADJUSTMENT';

@Entity('inventory_log')
export class InventoryLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  transaction_type!: TransactionType;

  @Column({ nullable: true, type: 'text' })
  note?: string;

  @OneToMany(() => InventoryLogItem, item => item.log, { cascade: true })
  items!: InventoryLogItem[];

  @OneToOne(() => Sale, { nullable: true, eager: false})
  @JoinColumn({ name: 'sale_id' })
  sale?: Sale;

  @Column({ nullable: true })
  sale_id?: number;

  @CreateDateColumn()
  created_at!: Date;
}