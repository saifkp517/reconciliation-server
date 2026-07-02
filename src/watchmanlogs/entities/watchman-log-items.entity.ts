import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { Watchman_Logs } from './watchman-log.entity';
import { InventoryItem } from '../../inventory/entities/inventory_items.entity';

@Entity('watchman_log_items')
export class Watchman_Log_Item {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'watchman_log_id' })
  watchman_log_id!: number;

  @ManyToOne(() => Watchman_Logs, watchmanLog => watchmanLog.items)
  @JoinColumn({ name: 'watchman_log_id' })
  watchman_log!: Watchman_Logs;

  @Column({ name: 'item_id', nullable: true })
  itemId!: number | null;

  @ManyToOne(() => InventoryItem, { eager: false, nullable: true })
  @JoinColumn({ name: 'item_id' })
  item!: InventoryItem;

  @Column({ type: 'int' })
  quantity!: number;

  /** Unit selling price */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, name: 'unit_sp' })
  unit_sp!: number;

  /** Line total selling price (unit_sp × quantity) */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0, name: 'line_sp' })
  line_sp!: number;
}
