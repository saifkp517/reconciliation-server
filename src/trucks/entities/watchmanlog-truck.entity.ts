// sale-truck.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Watchman_Logs } from '../../watchmanlogs/entities/watchman-log.entity';
import { Truck } from './truck.entity';
import { WatchmanLogTruckItem } from './watchmanlog-truck-item.entity';

@Entity('watchman_log_trucks')
export class WatchmanLogTruck {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  sale_id!: number;

  @Column()
  truck_id!: number;

  @Column({ type: 'timestamp', nullable: true })
  departed_at!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  arrived_at!: Date | null;

  @Column({ default: 'pending' })
  status!: string;

  @CreateDateColumn()
  created_at!: Date;

  @ManyToOne(() => Watchman_Logs, watchmanLog => watchmanLog.trucks)
  @JoinColumn({ name: 'sale_id' })
  watchmanLog!: Watchman_Logs;

  @ManyToOne(() => Truck, truck => truck.watchmanLogTrucks)
  @JoinColumn({ name: 'truck_id' })
  truck!: Truck;

  @OneToMany(() => WatchmanLogTruckItem, item => item.watchmanLogTruck, { cascade: true })
  items!: WatchmanLogTruckItem[];
}