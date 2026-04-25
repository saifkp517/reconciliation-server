// entities/inventory-log-item.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { InventoryLog } from './inventory-log.entity';
import type { InventoryKey } from './inventory.entity';

@Entity('inventory_log_item')
export class InventoryLogItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => InventoryLog, log => log.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'log_id' })
  log!: InventoryLog;

  @Column()
  inventory_key!: InventoryKey;

  /** Positive = stock added. Negative = stock removed. */
  @Column({ type: 'int' })
  delta!: number;
}