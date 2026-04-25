import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Inventory } from './entities/inventory.entity';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { InventoryLog } from './entities/inventory-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Inventory, InventoryLog])],
  providers: [InventoryService],
  controllers: [InventoryController],
  exports: [InventoryService], // 👈 SalesModule imports this
})
export class InventoryModule {}