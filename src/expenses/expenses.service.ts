import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExpenseLog } from './entities/expense-log.entity';
import { ExpenseLogItem, ExpenseItemCategory } from './entities/expense-log-item.entity';

export class CreateExpenseLogDto {
  date!: string;       // ISO date: "YYYY-MM-DD"
  submittedBy!: string;
  rawText?: string;
}

export class SaveParsedItemDto {
  description!: string;
  quantity!: number;
  unitPrice!: number;
  totalAmount!: number;
  category?: ExpenseItemCategory;
  notes?: string;
}

export class UpdateExpenseLogItemDto {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  totalAmount?: number;
  category?: ExpenseItemCategory;
  notes?: string;
}

export class CategorizeItemDto {
  id!: number;
  category!: ExpenseItemCategory;
}

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(ExpenseLog)
    private readonly expenseLogRepo: Repository<ExpenseLog>,
    @InjectRepository(ExpenseLogItem)
    private readonly expenseLogItemRepo: Repository<ExpenseLogItem>,
  ) {}

  async create(dto: CreateExpenseLogDto): Promise<ExpenseLog> {
    return this.expenseLogRepo.save(this.expenseLogRepo.create(dto));
  }

  async findAll(): Promise<ExpenseLog[]> {
    return this.expenseLogRepo.find({
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
  }

  async findByUser(submittedBy: string): Promise<ExpenseLog[]> {
    return this.expenseLogRepo.find({
      where: { submittedBy },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<ExpenseLog> {
    const log = await this.expenseLogRepo.findOne({ where: { id }, relations: ['items'] });
    if (!log) throw new NotFoundException(`ExpenseLog #${id} not found`);
    return log;
  }

  async saveParsedItems(id: number, items: SaveParsedItemDto[]): Promise<ExpenseLog> {
    const log = await this.findOne(id);
    await this.expenseLogItemRepo.delete({ expenseLogId: id });
    const newItems = items.map(item => this.expenseLogItemRepo.create({ ...item, expenseLogId: id }));
    await this.expenseLogItemRepo.save(newItems);
    return this.findOne(id);
  }

  async updateItem(itemId: number, dto: UpdateExpenseLogItemDto): Promise<ExpenseLogItem> {
    const item = await this.expenseLogItemRepo.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException(`ExpenseLogItem #${itemId} not found`);
    Object.assign(item, dto);
    return this.expenseLogItemRepo.save(item);
  }

  async categorizeItems(id: number, items: CategorizeItemDto[]): Promise<ExpenseLog> {
    const log = await this.findOne(id);
    for (const { id: itemId, category } of items) {
      const item = await this.expenseLogItemRepo.findOne({ where: { id: itemId, expenseLogId: id } });
      if (!item) throw new NotFoundException(`ExpenseLogItem #${itemId} not found on log #${id}`);
      item.category = category;
      await this.expenseLogItemRepo.save(item);
    }
    return this.findOne(id);
  }

  async confirm(id: number): Promise<ExpenseLog> {
    const log = await this.findOne(id);
    return this.expenseLogRepo.save(log);
  }

  async deleteItem(itemId: number): Promise<void> {
    const item = await this.expenseLogItemRepo.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException(`ExpenseLogItem #${itemId} not found`);
    await this.expenseLogItemRepo.remove(item);
  }

  async delete(id: number): Promise<void> {
    const log = await this.findOne(id);
    await this.expenseLogRepo.remove(log);
  }
}
