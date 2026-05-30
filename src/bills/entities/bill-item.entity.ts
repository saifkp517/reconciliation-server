import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Bill } from './bill.entity';

@Entity('bill_items')
export class BillItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  bill_id!: number;

  @Column({ nullable: true })
  dimension!: string;

  @Column({ nullable: true })
  name!: string;

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