import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillsService } from './bills.service';
import { BillsController } from './bills.controller';
import { Bill } from './entities/bill.entity';
import { BillItem } from './entities/bill-item.entity';
import { BillPayment } from './entities/bill-payment.entity';
import { InvoiceSequence } from './entities/invoice-sequence.entity';
import { InventoryItem } from '../inventory/entities/inventory_items.entity';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Bill, BillItem, BillPayment, InvoiceSequence, InventoryItem]),
    CustomersModule,
  ],
  controllers: [BillsController],
  providers: [BillsService],
  exports: [BillsService],
})
export class BillsModule {}
