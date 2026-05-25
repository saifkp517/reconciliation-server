import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm'

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ unique: true })
  username!: string

  @Column()
  password_hash!: string

  @Column()
  role!: string

  @CreateDateColumn()
  created_at!: Date
}