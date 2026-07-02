import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Watchman_Logs } from './entities/watchman-log.entity';
import { Watchman_Log_Item } from './entities/watchman-log-items.entity';
import { WatchmanLogTruck } from '../trucks/entities/watchmanlog-truck.entity';
import { WatchmanLogTruckItem } from '../trucks/entities/watchmanlog-truck-item.entity';
import { Truck } from '../trucks/entities/truck.entity';
import { InventoryModule } from '../inventory/inventory.module';
import { WatchmanLogsService } from './watchmanlogs.service';
import { TrucksModule } from '../trucks/trucks.module';
import { WatchmanLogsController } from './watchmanlogs.controller';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Watchman_Logs, Watchman_Log_Item, Truck, WatchmanLogTruck, WatchmanLogTruckItem]),
    InventoryModule,
    TrucksModule,
    CustomersModule,
  ],
  providers: [WatchmanLogsService],
  controllers: [WatchmanLogsController],
  exports: [WatchmanLogsService],
})
export class WatchmanLogsModule {}
