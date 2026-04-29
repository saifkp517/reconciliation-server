import { Module } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationController } from './reconciliation.controller';
import { DatabaseModule } from '../database/database.module';
import { ZohoModule } from '../zoho/zoho.module';
import { SalesModule } from '../sales/sales.module';

@Module({
  imports: [DatabaseModule, ZohoModule, SalesModule],
  providers: [ReconciliationService],
  controllers: [ReconciliationController],
})
export class ReconciliationModule {}