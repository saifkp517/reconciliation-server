import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { WatchmanLogsModule } from './watchmanlogs/watchmanlogs.module';
import { Watchman_Logs } from './watchmanlogs/entities/watchman-log.entity';
import { Watchman_Log_Item } from './watchmanlogs/entities/watchman-log-items.entity';
import { WatchmanLogTruck } from './trucks/entities/watchmanlog-truck.entity';
import { WatchmanLogTruckItem } from './trucks/entities/watchmanlog-truck-item.entity';
import { Customer } from './watchmanlogs/entities/customer.entity';
import { InventoryItem } from './inventory/entities/inventory_items.entity';
import { TrucksModule } from './trucks/trucks.module';
import { Expense } from './inventory/entities/expense.entity';
import { InventoryModule } from './inventory/inventory.module';
import { EmployeeExpenseModule } from './employee-expense/employee-expense.module';
import { ReportsModule } from './reports/reports.module';
import { AuthModule } from './auth/auth.module';
import { BillsModule } from './bills/bills.module';
import { Bill } from './bills/entities/bill.entity';
import { BillItem } from './bills/entities/bill-item.entity'
import { Truck } from './trucks/entities/truck.entity';
import { InventoryTransaction } from './inventory/entities/inventory_transactions.entity';
import { CustomerPriceList } from './watchmanlogs/entities/customer_pricelist.entity';
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
        entities: [ Watchman_Logs, Watchman_Log_Item, WatchmanLogTruck, WatchmanLogTruckItem, Customer, Truck, Expense, InventoryItem, InventoryTransaction, CustomerPriceList, User, Bill, BillItem],
        synchronize: true, // fine for dev, turn off in production
        logging: false,
      }),
    }),
    WatchmanLogsModule,
    TrucksModule,
    InventoryModule,
    EmployeeExpenseModule,
    ReportsModule,
    BillsModule,
    AuthModule
  ],
  controllers: [AppController],
})
export class AppModule { }