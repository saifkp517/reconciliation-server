import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { Customer } from '../database/entities/customer.entity';
import { Truck } from '../trucks/entities/truck.entity';
import { SaleTruck } from '../trucks/entities/sale-truck.entity';
import { SaleTruckItem } from '../trucks/entities/sale-truck-item.entity';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sale, SaleItem, Customer, Truck, SaleTruck, SaleTruckItem]),
    AuthModule,
    InventoryModule
  ],
  providers: [SalesService],
  controllers: [SalesController],
  exports: [SalesService],
})
export class SalesModule { }