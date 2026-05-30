// watchmanlog-truck-item.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { WatchmanLogTruck } from './watchmanlog-truck.entity';
import { Watchman_Log_Item } from '../../watchmanlogs/entities/watchman-log-items.entity';

@Entity('watchmanlog_truck_items')
export class WatchmanLogTruckItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  watchmanlog_truck_id!: number;

  @Column()
  watchman_log_item_id!: number;

  @Column({ type: 'int' })
  quantity!: number; // portion of Watchman_Log_Item.quantity on this truck

  @Column({ type: 'text', nullable: true })
  notes!: string;

  @ManyToOne(() => WatchmanLogTruck, wt => wt.items)
  @JoinColumn({ name: 'watchmanlog_truck_id' })
  watchmanLogTruck!: WatchmanLogTruck;

  @ManyToOne(() => Watchman_Log_Item)
  @JoinColumn({ name: 'watchman_log_item_id' })
  watchmanLogItem!: Watchman_Log_Item;
}