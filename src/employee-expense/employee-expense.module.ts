import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeExpenseController } from './employee-expense.controller';
import { EmployeeExpenseService } from './employee-expense.service';
import { Expense } from '../inventory/entities/expense.entity';


@Module({
    imports: [TypeOrmModule.forFeature([Expense])],
    controllers: [EmployeeExpenseController],
    providers: [EmployeeExpenseService],
})
export class EmployeeExpenseModule { }