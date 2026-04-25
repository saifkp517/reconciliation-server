import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Truck } from './entities/truck.entity';
import { SaleTruck } from './entities/sale-truck.entity';
import { Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class TrucksService {
  constructor(
    @InjectRepository(Truck)
    private truckRepo: Repository<Truck>,

    @InjectRepository(SaleTruck)
    private saleTruckRepo: Repository<SaleTruck>,
  ) { }

  async getActiveTrucks(): Promise<Truck[]> {
    // active = busy
    return this.truckRepo.find({
      where: { is_active: true },
      order: { id: 'ASC' },
    });
  }

  async getTruckTimeline(fromDate: Date, toDate: Date): Promise<SaleTruck[]> {
    return this.saleTruckRepo.find({
      where: {
        departed_at: Between(fromDate, toDate),
      },
      relations: ['truck', 'sale', 'sale.customer', 'items', 'items.saleItem'],
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

  async getTrucksBySale(saleId: number): Promise<SaleTruck[]> {
    return this.saleTruckRepo.find({
      where: { sale_id: saleId },
      relations: ['truck', 'items'],
    });
  }

  async markTruckReturned(
    truckId: number,
    returnedAt: Date,
  ): Promise<SaleTruck> {
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
}