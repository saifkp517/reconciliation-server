import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { ZohoModule } from './zoho/zoho.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { AppController } from './app.controller';
import { Sale } from './sales/entities/sale.entity';
import { SaleItem } from './sales/entities/sale-item.entity';
import { Customer } from './database/entities/customer.entity';
import { SalesModule } from './sales/sales.module';
import { ReportsModule } from './reports/reports.module';
import { SaleTruck } from './trucks/entities/sale-truck.entity';
import { SaleTruckItem } from './trucks/entities/sale-truck-item.entity';
import { TrucksModule } from './trucks/trucks.module';
import { InventoryModule } from './inventory/inventory.module';
import { Inventory } from './inventory/entities/inventory.entity';
import { InventoryLog } from './inventory/entities/inventory-log.entity';
import { InventoryLogItem } from './inventory/entities/inventory-log-item.entity';
import { Truck } from './trucks/entities/truck.entity';
import { ZohoCacheWarmModule } from './cache/cache.module';

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
        entities: [ Sale, SaleItem, Customer, SaleTruck, SaleTruckItem, Truck, Inventory, InventoryLog, InventoryLogItem],
        synchronize: true, // fine for dev, turn off in production
        logging: false,
      }),
    }),
    DatabaseModule,
    AuthModule,
    ZohoModule,
    ReconciliationModule,
    SalesModule,
    ReportsModule,
    TrucksModule,
    InventoryModule,
    ZohoCacheWarmModule
  ],
  controllers: [AppController],
})
export class AppModule {}