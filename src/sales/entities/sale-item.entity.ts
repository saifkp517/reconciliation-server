import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { Sale } from './sale.entity';

@Entity('sale_items')
export class SaleItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'sale_id' })
  sale_id!: number;

  @ManyToOne(() => Sale, sale => sale.items)
  @JoinColumn({ name: 'sale_id' })
  sale!: Sale;

  @Column({ type: 'varchar', nullable: true })
  dimension!: string;

  @Column({ type: 'varchar', nullable: true })
  name!: string;

  @Column({ type: 'int' })
  quantity!: number;

  /** Unit selling price */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, name: 'unit_sp' })
  unit_sp!: number;

  /** Line total selling price (unit_sp × quantity) */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0, name: 'line_sp' })
  line_sp!: number;
}