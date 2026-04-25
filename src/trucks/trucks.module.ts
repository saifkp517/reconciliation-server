import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrucksService } from './trucks.service';
import { TrucksController } from './trucks.controller';
import { Truck } from './entities/truck.entity';
import { SaleTruck } from './entities/sale-truck.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Truck, SaleTruck]),
  ],
  providers: [TrucksService],
  controllers: [TrucksController],
  exports: [TrucksService],
})
export class TrucksModule {}