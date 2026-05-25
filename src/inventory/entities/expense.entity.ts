import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

@Entity('expenses')
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'logged_by' })
  loggedBy!: string;

  @Column()
  description!: string;

  @Column('decimal', { precision: 10, scale: 2 })
  amount!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}