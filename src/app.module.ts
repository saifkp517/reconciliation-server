import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { WatchmanLogsModule } from './watchmanlogs/watchmanlogs.module';
import { Watchman_Logs } from './watchmanlogs/entities/watchman-log.entity';
import { Watchman_Log_Item } from './watchmanlogs/entities/watchman-log-items.entity';
import { WatchmanLogTruck } from './trucks/entities/watchmanlog-truck.entity';
import { WatchmanLogTruckItem } from './trucks/entities/watchmanlog-truck-item.entity';
import { Customer } from './customers/entities/customer.entity';
import { CustomerPriceList } from './customers/entities/customer_pricelist.entity';
import { InventoryItem } from './inventory/entities/inventory_items.entity';
import { TrucksModule } from './trucks/trucks.module';
import { InventoryModule } from './inventory/inventory.module';
import { ExpensesModule } from './expenses/expenses.module';
import { ReportsModule } from './reports/reports.module';
import { AuthModule } from './auth/auth.module';
import { BillsModule } from './bills/bills.module';
import { Bill } from './bills/entities/bill.entity';
import { BillItem } from './bills/entities/bill-item.entity';
import { BillPayment } from './bills/entities/bill-payment.entity';
import { InvoiceSequence } from './bills/entities/invoice-sequence.entity';
import { Truck } from './trucks/entities/truck.entity';
import { InventoryTransaction } from './inventory/entities/inventory_transactions.entity';
import { ExpenseLog } from './expenses/entities/expense-log.entity';
import { ExpenseLogItem } from './expenses/entities/expense-log-item.entity';
import { User } from './auth/user.entity';
import { CustomersModule } from './customers/customers.module';

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
        entities: [Watchman_Logs, Watchman_Log_Item, WatchmanLogTruck, WatchmanLogTruckItem, Customer, CustomerPriceList, Truck, InventoryItem, InventoryTransaction, ExpenseLog, ExpenseLogItem, User, Bill, BillItem, BillPayment, InvoiceSequence],
        synchronize: true,
        logging: false,
      }),
    }),
    CustomersModule,
    WatchmanLogsModule,
    TrucksModule,
    InventoryModule,
    ExpensesModule,
    ReportsModule,
    BillsModule,
    AuthModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
