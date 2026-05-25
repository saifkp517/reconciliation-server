import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { Customer } from './entities/customer.entity';
import { Truck } from '../trucks/entities/truck.entity';
import { SaleTruck } from '../trucks/entities/sale-truck.entity';
import { SaleTruckItem } from '../trucks/entities/sale-truck-item.entity';
import { InventoryModule } from '../inventory/inventory.module';
import { SalesService } from './sales.service';
import { TrucksModule } from '../trucks/trucks.module';
import { SalesController } from './sales.controller';
import { CustomerPriceList } from './entities/customer_pricelist.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sale, SaleItem, Customer, Truck, SaleTruck, SaleTruckItem, CustomerPriceList]),
    InventoryModule,
    TrucksModule
  ],
  providers: [SalesService],
  controllers: [SalesController],
  exports: [SalesService],
})
export class SalesModule {}