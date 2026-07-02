import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Bill } from './bill.entity';
import { InventoryItem } from '../../inventory/entities/inventory_items.entity';

@Entity('bill_items')
export class BillItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  bill_id!: number;

  @Column({ name: 'item_id', nullable: true })
  itemId!: number | null;

  @ManyToOne(() => InventoryItem, { eager: false, nullable: true })
  @JoinColumn({ name: 'item_id' })
  item!: InventoryItem;

  @Column()
  quantity!: number;

  @Column({ type: 'numeric', default: 0 })
  unit_sp!: number;

  @Column({ type: 'numeric', default: 0 })
  line_sp!: number;

  @ManyToOne(() => Bill, bill => bill.items)
  @JoinColumn({ name: 'bill_id' })
  bill!: Bill;
}
