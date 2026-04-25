// sale-truck-item.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { SaleTruck } from './sale-truck.entity';
import { SaleItem } from '../../sales/entities/sale-item.entity';

@Entity('sale_truck_items')
export class SaleTruckItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  sale_truck_id!: number;

  @Column()
  sale_item_id!: number;

  @Column({ type: 'int' })
  quantity!: number; // portion of SaleItem.quantity on this truck

  @Column({ type: 'text', nullable: true })
  notes!: string;

  @ManyToOne(() => SaleTruck, st => st.items)
  @JoinColumn({ name: 'sale_truck_id' })
  saleTruck!: SaleTruck;

  @ManyToOne(() => SaleItem)
  @JoinColumn({ name: 'sale_item_id' })
  saleItem!: SaleItem;
}