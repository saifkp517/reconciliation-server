import { Module } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationController } from './reconciliation.controller';
import { DatabaseModule } from '../database/database.module';
import { ZohoModule } from '../zoho/zoho.module';

@Module({
  imports: [DatabaseModule, ZohoModule],
  providers: [ReconciliationService],
  controllers: [ReconciliationController],
})
export class ReconciliationModule {}