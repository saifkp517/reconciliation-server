import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { Watchman_Logs } from '../watchmanlogs/entities/watchman-log.entity';
import { Watchman_Log_Item } from '../watchmanlogs/entities/watchman-log-items.entity';
import { WatchmanLogTruck } from './entities/watchmanlog-truck.entity';
import { WatchmanLogTruckItem } from './entities/watchmanlog-truck-item.entity';
import { CreateSaleTruckDto } from '../watchmanlogs/watchmanlogs.service';
import { Between, Repository } from 'typeorm';
import { Truck } from './entities/truck.entity';
import { Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class TrucksService {
  constructor(
    @InjectRepository(Truck)
    private truckRepo: Repository<Truck>,

    @InjectRepository(WatchmanLogTruck)
    private saleTruckRepo: Repository<WatchmanLogTruck>,
  ) { }

  async getActiveTrucks(): Promise<Truck[]> {
    // active = busy
    return this.truckRepo.find({
      where: { is_active: true },
      order: { id: 'ASC' },
    });
  }

  async getTruckTimeline(fromDate: Date, toDate: Date): Promise<WatchmanLogTruck[]> {
    return this.saleTruckRepo.find({
      where: {
        departed_at: Between(fromDate, toDate),
      },
      relations: ['truck', 'watchmanLog', 'watchmanLog.customer', 'items', 'items.watchmanLogItem'],
      order: { departed_at: 'ASC' },
    });
  }

  async getInactiveTrucks(): Promise<Truck[]> {
    // inactive = available
    return this.truckRepo.find({
      where: { is_active: false },
      order: { id: 'ASC' },
    });
  }

  async getTrucksBySale(saleId: number): Promise<WatchmanLogTruck[]> {
    return this.saleTruckRepo.find({
      where: { sale_id: saleId },
      relations: ['truck', 'items'],
    });
  }

  async markTruckReturned(
    truckId: number,
    returnedAt: Date,
  ): Promise<WatchmanLogTruck> {
    const saleTruck = await this.saleTruckRepo.findOne({
      where: { truck_id: truckId, status: 'pending' }, // or 
      relations: ['truck'],
    });

    if (!saleTruck) {
      throw new BadRequestException('SaleTruck not found or already returned');
    }

    saleTruck.status = 'completed';
    saleTruck.arrived_at = returnedAt;

    await this.saleTruckRepo.save(saleTruck);

    await this.truckRepo.update(truckId, { is_active: false });

    return saleTruck;
  }

  async assignTrucksToSale(
    manager: EntityManager,
    saleId: number,
    savedItems: Watchman_Log_Item[],
    dtoItems: { dimension: string; quantity: number }[],
    trucks: CreateSaleTruckDto[],
    skipActiveCheck = false,
  ): Promise<void> {
    for (const truckDto of trucks) {
      const truck = await manager.findOne(Truck, {
        where: {
          id: truckDto.truck_id,
          ...(skipActiveCheck ? {} : { is_active: false }),
        },
      });
      if (!truck) {
        throw new BadRequestException(
          `Truck ${truckDto.truck_id} does not exist or is not available`,
        );
      }

      await manager.update(Truck, truckDto.truck_id, { is_active: true });

      for (const ti of truckDto.items) {
        const saleItem = dtoItems[ti.sale_item_index];
        if (!saleItem) throw new BadRequestException(`Invalid sale_item_index: ${ti.sale_item_index}`);

        const totalAssigned = trucks.reduce(
          (sum, t) =>
            sum +
            t.items
              .filter(i => i.sale_item_index === ti.sale_item_index)
              .reduce((s, i) => s + i.quantity, 0),
          0,
        );

        if (totalAssigned > saleItem.quantity) {
          throw new BadRequestException(
            `Quantities for item[${ti.sale_item_index}] across trucks exceed sale quantity (${totalAssigned} > ${saleItem.quantity})`,
          );
        }
      }

      const saleTruck = await manager.save(
        WatchmanLogTruck,
        manager.create(WatchmanLogTruck, {
          sale_id: saleId,
          truck_id: truckDto.truck_id,
          notes: truckDto.notes,
          status: 'pending',
          departed_at: truckDto.departed_at ? new Date(truckDto.departed_at) : new Date(),
          arrived_at: truckDto.arrived_at ? new Date(truckDto.arrived_at) : null,
        }),
      );

      await manager.save(
        WatchmanLogTruckItem,
        truckDto.items.map(ti =>
          manager.create(WatchmanLogTruckItem, {
            watchmanlog_truck_id: saleTruck.id,
            watchman_log_item_id: savedItems[ti.sale_item_index].id,
            quantity: ti.quantity,
            notes: ti.notes,
          }),
        ),
      );
    }
  }
}