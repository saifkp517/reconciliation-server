import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { InventoryTransaction } from './inventory_transactions.entity';

export enum InventoryItemName {
  CEMENT_BAGS = 'CEMENT_BAGS',
  BLOCK_4_INCHES = 'BLOCK_4_INCHES',
  BLOCK_6_INCHES = 'BLOCK_6_INCHES',
  BLOCK_8_INCHES = 'BLOCK_8_INCHES',
}

@Entity('inventory_items')
export class InventoryItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  name!: string;

  /**
   * Human-readable label, e.g. "BLOCK 4 inches"
   */
  @Column({ type: 'varchar' })
  label!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  unit!: string | null;

  /**
   * Running stock total. Always kept in sync by InventoryStoreService.
   * Never mutate directly — go through a transaction row.
   */
  @Column({ type: 'decimal', precision: 12, scale: 3, default: 0 })
  stock!: number;

  /**
   * Last known purchase / unit price (used for expense logging on cement restocks).
   */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, name: 'unit_price' })
  unitPrice!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => InventoryTransaction, (tx) => tx.item)
  transactions!: InventoryTransaction[];
}