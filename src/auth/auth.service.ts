import { Injectable, UnauthorizedException, BadRequestException, ConflictException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User } from './user.entity'
import * as bcrypt from 'bcrypt'

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,
  ) {}

  async login(username: string, password: string) {
    const user = await this.usersRepo.findOne({ where: { username } })
    if (!user) throw new UnauthorizedException('Invalid username or password')

    const match = await bcrypt.compare(password, user.password_hash)
    if (!match) throw new UnauthorizedException('Invalid username or password')

    return { id: user.id, username: user.username, role: user.role }
  }

  async createUser(username: string, password: string, role: string) {
    const existing = await this.usersRepo.findOne({ where: { username } })
    if (existing) throw new ConflictException('Username already exists')

    if (password.length < 6) throw new BadRequestException('Password must be 6+ characters')

    const password_hash = await bcrypt.hash(password, 10)
    const user = this.usersRepo.create({ username, password_hash, role })
    await this.usersRepo.save(user)

    return { id: user.id, username: user.username, role: user.role }
  }

  async resetPassword(userId: string, newPassword: string) {
    if (newPassword.length < 6) throw new BadRequestException('Password must be 6+ characters')

    const password_hash = await bcrypt.hash(newPassword, 10)
    await this.usersRepo.update(userId, { password_hash })
  }

  async listUsers() {
    return this.usersRepo.find({
      select: ['id', 'username', 'role', 'created_at'],
      order: { created_at: 'DESC' },
    })
  }

  async deleteUser(userId: string) {
    await this.usersRepo.delete(userId)
  }
}