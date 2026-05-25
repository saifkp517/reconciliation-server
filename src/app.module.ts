import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { Sale } from './sales/entities/sale.entity';
import { SaleItem } from './sales/entities/sale-item.entity';
import { Customer } from './sales/entities/customer.entity';
import { SalesModule } from './sales/sales.module';
import { SaleTruck } from './trucks/entities/sale-truck.entity';
import { InventoryItem } from './inventory/entities/inventory_items.entity';
import { SaleTruckItem } from './trucks/entities/sale-truck-item.entity';
import { TrucksModule } from './trucks/trucks.module';
import { Expense } from './inventory/entities/expense.entity';
import { InventoryModule } from './inventory/inventory.module';
import { EmployeeExpenseModule } from './employee-expense/employee-expense.module';
import { ReportsModule } from './reports/reports.module';
import { AuthModule } from './auth/auth.module';
import { Truck } from './trucks/entities/truck.entity';
import { InventoryTransaction } from './inventory/entities/inventory_transactions.entity';
import { CustomerPriceList } from './sales/entities/customer_pricelist.entity';
import { User } from './auth/user.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('SUPABASE_DB_URL'),
        ssl: { rejectUnauthorized: false },
        entities: [Sale, SaleItem, Customer, SaleTruck, SaleTruckItem, Truck, Expense, InventoryItem, InventoryTransaction, CustomerPriceList, User],
        synchronize: true, // fine for dev, turn off in production
        logging: false,
      }),
    }),
    SalesModule,
    TrucksModule,
    InventoryModule,
    EmployeeExpenseModule,
    ReportsModule,
    AuthModule
  ],
  controllers: [AppController],
})
export class AppModule { }