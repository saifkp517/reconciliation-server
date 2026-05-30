import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrucksService } from './trucks.service';
import { TrucksController } from './trucks.controller';
import { Truck } from './entities/truck.entity';
import { WatchmanLogTruck } from './entities/watchmanlog-truck.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Truck, WatchmanLogTruck]),
  ],
  providers: [TrucksService],
  controllers: [TrucksController],
  exports: [TrucksService],
})
export class TrucksModule {}