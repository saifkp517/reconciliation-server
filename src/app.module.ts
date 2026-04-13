import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { ZohoModule } from './zoho/zoho.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { AppController } from './app.controller';
import { Sale } from './database/entities/sale.entity';
import { SaleItem } from './database/entities/sale-item.entity';
import { Customer } from './database/entities/customer.entity';
import { SalesModule } from './sales/sales.module';
import { ReportsModule } from './reports/reports.module';

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
        entities: [Sale, SaleItem, Customer],
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
  ],
  controllers: [AppController],
})
export class AppModule {}