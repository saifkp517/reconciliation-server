// truck.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { SaleTruck } from './sale-truck.entity';

@Entity('trucks')
export class Truck {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  registration_no!: string;

  @Column({ nullable: true })
  driver_name!: string;

  @Column({ default: true })
  is_active!: boolean;

  @OneToMany(() => SaleTruck, st => st.truck)
  saleTrucks!: SaleTruck[];
}