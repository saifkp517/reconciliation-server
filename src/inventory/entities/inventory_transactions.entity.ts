import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { InventoryItem } from './inventory_items.entity';

export enum TransactionReason {
  PURCHASE   = 'PURCHASE',    // cement bags bought
  PRODUCTION = 'PRODUCTION',  // blocks manufactured (cement -, blocks +)
  DISPATCH   = 'DISPATCH',    // blocks sent out on trucks
  ADJUSTMENT = 'ADJUSTMENT',  // manual correction
}

@Entity('inventory_transactions')
export class InventoryTransaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => InventoryItem, (item) => item.transactions, { nullable: false })
  @JoinColumn!({ name: 'item_id' })
  item!: InventoryItem;

  @Column({ name: 'item_id' })
  itemId!: number;

  /**
   * Positive = stock added, Negative = stock removed.
   */
  @Column({ type: 'decimal', precision: 12, scale: 3, name: 'quantity_delta' })
  quantityDelta!: number;

  /**
   * Stock level on this item *after* this transaction was applied.
   */
  @Column({ type: 'decimal', precision: 12, scale: 3, name: 'stock_after' })
  stockAfter!: number;

  @Column({ type: 'enum', enum: TransactionReason })
  reason!: TransactionReason;

  /**
   * Free-text notes — e.g. sale ID for dispatches, batch info for production.
   */
  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  /**
   * Supabase user or system actor who triggered the change.
   */
  @Column({ type: 'varchar', nullable: true, name: 'logged_by' })
  loggedBy!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}