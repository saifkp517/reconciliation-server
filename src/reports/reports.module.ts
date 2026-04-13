import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { DatabaseModule } from '../database/database.module';

@Module({ 
  imports: [DatabaseModule],
  controllers: [ReportsController],
})
export class ReportsModule {}
