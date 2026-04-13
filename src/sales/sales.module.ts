import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { Sale } from '../database/entities/sale.entity';
import { SaleItem } from '../database/entities/sale-item.entity';
import { Customer } from '../database/entities/customer.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Sale, SaleItem, Customer])],
  providers: [SalesService],
  controllers: [SalesController],
  exports: [SalesService],
})
export class SalesModule {}