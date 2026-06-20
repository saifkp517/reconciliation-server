// truck.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { WatchmanLogTruck } from './watchmanlog-truck.entity';

@Entity('trucks')
export class Truck {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  registration_no!: string;

  @Column({ default: true })
  is_available!: boolean;

  @Column({ type: 'date', nullable: true })
  mv_tax_renewal_date!: Date | null;

  @Column({ type: 'date', nullable: true })
  vehicle_fitness_renewal_date!: Date | null;

  @Column({ type: 'date', nullable: true })
  insurance_expiry_renewal_date!: Date | null;

  @Column({ type: 'date', nullable: true })
  vehicle_pucc_renewal_date!: Date | null;

  @OneToMany(() => WatchmanLogTruck, wlt => wlt.truck)
  watchmanLogTrucks!: WatchmanLogTruck[];
}