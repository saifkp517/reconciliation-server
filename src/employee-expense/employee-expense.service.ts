import {
  Injectable, ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from '../inventory/entities/expense.entity';

@Injectable()
export class EmployeeExpenseService {
  constructor(
    @InjectRepository(Expense)
    private readonly expenseRepo: Repository<Expense>,
  ) {}

  async create(username: string, body: { description: string; amount: number; date?: string }) {
    return this.expenseRepo.save(this.expenseRepo.create({
      loggedBy: username,
      description: body.description,
      amount: body.amount,
      createdAt: body.date ? new Date(body.date) : new Date(),
    }));
  }

  async findByUser(username: string) {
    return this.expenseRepo.find({ where: { loggedBy: username } });
  }

  async update(username: string, id: string, body: { description?: string; amount?: number; date?: string }) {
    const expense = await this.expenseRepo.findOne({ where: { id } });
    if (!expense) throw new NotFoundException();
    if (expense.loggedBy !== username) throw new ForbiddenException();

    if (body.description) expense.description = body.description;
    if (body.amount) expense.amount = body.amount;
    if (body.date) expense.createdAt = new Date(body.date);

    return this.expenseRepo.save(expense);
  }
}