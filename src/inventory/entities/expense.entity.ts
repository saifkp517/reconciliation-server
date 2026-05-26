import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';

@Entity('expenses')
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'logged_by' })
  loggedBy!: string;

  @Column()
  description!: string;

  @Column('int')
  amount!: number;

  @Column('int', { default: 1 })
  qty!: number;

  @Column('int', { name: 'total_amount', default: 0 })
  totalAmount!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @BeforeInsert()
  @BeforeUpdate()
  calculateTotal() {
    this.totalAmount = this.amount * this.qty;
  }
}