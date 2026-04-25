// sale-truck.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Sale } from '../../sales/entities/sale.entity';
import { Truck } from './truck.entity';
import { SaleTruckItem } from './sale-truck-item.entity';

@Entity('sale_trucks')
export class SaleTruck {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  sale_id!: number;

  @Column()
  truck_id!: number;

  @Column({ type: 'timestamp', nullable: true })
  departed_at!: Date;

  @Column({ type: 'timestamp', nullable: true })
  arrived_at!: Date;

  @Column({ default: 'pending' })
  status!: string;

  @CreateDateColumn()
  created_at!: Date;

  @ManyToOne(() => Sale, sale => sale.trucks)
  @JoinColumn({ name: 'sale_id' })
  sale!: Sale;

  @ManyToOne(() => Truck, truck => truck.saleTrucks)
  @JoinColumn({ name: 'truck_id' })
  truck!: Truck;

  @OneToMany(() => SaleTruckItem, item => item.saleTruck, { cascade: true })
  items!: SaleTruckItem[];
}