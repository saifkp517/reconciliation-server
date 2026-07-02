import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryItem } from './entities/inventory_items.entity';
import { InventoryTransaction } from './entities/inventory_transactions.entity';
import { InventoryStoreService } from './inventory_store.service';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([InventoryItem, InventoryTransaction]),
  ],
  providers: [InventoryStoreService, InventoryService],
  controllers: [InventoryController],
  exports: [InventoryService, InventoryStoreService],
})
export class InventoryModule {}
