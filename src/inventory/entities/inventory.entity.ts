import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  CreateDateColumn,
} from 'typeorm';

export const VALID_DIMENSIONS = [
  'BLOCK 4 inches',
  'BLOCK 6 inches',
  'BLOCK 8 inches',
] as const;

export type BlockDimension = (typeof VALID_DIMENSIONS)[number];
export type InventoryKey = BlockDimension | 'CEMENT_BAGS';

@Entity('inventory')
export class Inventory {
  @PrimaryGeneratedColumn()
  id!: number;

  /**
   * Unique key for each inventory line.
   * One of: 'BLOCK 4 inches' | 'BLOCK 6 inches' | 'BLOCK 8 inches' | 'CEMENT_BAGS'
   */
  @Column({ unique: true })
  key!: string;

  /** Human-readable label e.g. "Block 4 Inches", "Cement Bags" */
  @Column()
  label!: string;

  /** Current quantity in stock */
  @Column({ type: 'int', default: 0 })
  quantity!: number;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}