import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillsService } from './bills.service';
import { BillsController } from './bills.controller';
import { Bill } from './entities/bill.entity';
import { BillItem } from './entities/bill-item.entity';
import { BillPayment } from './entities/bill-payment.entity';
import { InvoiceSequence } from './entities/invoice-sequence.entity';
import { CustomerPriceList } from '../watchmanlogs/entities/customer_pricelist.entity';
import { InventoryItem } from '../inventory/entities/inventory_items.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Bill, BillItem, BillPayment, InvoiceSequence, CustomerPriceList, InventoryItem]),
  ],
  controllers: [BillsController],
  providers: [BillsService],
  exports: [BillsService], // export if reconciliation module needs it later
})
export class BillsModule {}