import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { ExpenseLog } from './entities/expense-log.entity';
import { ExpenseLogItem } from './entities/expense-log-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ExpenseLog, ExpenseLogItem])],
  controllers: [ExpensesController],
  providers: [ExpensesService],
})
export class ExpensesModule {}
