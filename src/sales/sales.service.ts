import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { SaleTruck } from '../trucks/entities/sale-truck.entity';
import { SaleTruckItem } from '../trucks/entities/sale-truck-item.entity';
import { Customer } from '../database/entities/customer.entity';
import { AuthService } from '../auth/auth.service';
import axios from 'axios';
import { Truck } from '../trucks/entities/truck.entity';
import { InventoryService } from '../inventory/inventory.service';


export interface CreateSaleDto {
  customer_id: number;
  sale_date: string; // YYYY-MM-DD (recommended)
  items: {
    dimension: string;
    quantity: number;
  }[];
  trucks?: CreateSaleTruckDto[];
}

export interface CreateSaleTruckItemDto {
  sale_item_index: number; // index into the items array
  quantity: number;
  notes?: string;
}

export interface CreateSaleTruckDto {
  truck_id: number;
  notes?: string;
  items: CreateSaleTruckItemDto[];
}



@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    @InjectRepository(Sale)
    private saleRepository: Repository<Sale>,
    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,
    private authService: AuthService,
    private dataSource: DataSource,
    private readonly inventoryService: InventoryService,
  ) { }

  async getCustomers() {
    return this.customerRepository.find();
  }

  async getSaleById(id: number): Promise<Sale> {
    const sale = await this.saleRepository.findOne({
      where: { id },
      relations: {
        customer: true,
        items: true,
        trucks: {
          truck: true,
          items: true,
        },
      },
    });

    if (!sale) {
      throw new NotFoundException(`Sale #${id} not found`);
    }

    return sale;
  }

  async getItems(): Promise<any[]> {
    const token = await this.authService.getValidAccessToken();

    const response = await axios.get(
      'https://www.zohoapis.in/inventory/v1/items',
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
        },
        params: {
          organization_id: process.env.ZOHO_ORGANIZATION_ID,
        },
      },
    );

    return response.data.items;
  }

  async getItemByDimension(dimension: string) {
    const items = await this.getItems();

    const item = items.find(i => i.name === dimension);

    if (!item) {
      throw new Error(`Zoho item not found for dimension: ${dimension}`);
    }

    return item;
  }

  async createSale(dto: CreateSaleDto): Promise<Sale | null> {
    return this.dataSource.transaction(async manager => {
      const sale_date = dto.sale_date;

      const countToday = await manager.count(Sale, { where: { sale_date } });
      const sequence = String(countToday + 1).padStart(3, '0');
      const invoice_no = `INV-${sale_date.replace(/-/g, '')}-${sequence}`;

      // step 1 — create sale header
      const sale = manager.create(Sale, {
        customer_id: dto.customer_id,
        sale_date,
        invoice_no,
      });
      const savedSale = await manager.save(Sale, sale);

      // step 2 — create sale items
      const saleItems: SaleItem[] = [];

      for (const item of dto.items) {
        const zohoItem = await this.getItemByDimension(item.dimension);

        const unit_sp = zohoItem.rate;
        const unit_cp = zohoItem.purchase_rate;

        saleItems.push(
          manager.create(SaleItem, {
            sale_id: savedSale.id,
            dimension: item.dimension,
            quantity: item.quantity,
            unit_sp,
            unit_cp,
            zoho_item_id: zohoItem.item_id,
            name: zohoItem.name,
            line_sp: unit_sp * item.quantity,
            line_cp: unit_cp * item.quantity,
          }),
        );
      }
      const savedItems = await manager.save(SaleItem, saleItems);

      // step 3 — compute and update totals
      const total_sp = savedItems.reduce((sum, i) => sum + i.unit_sp * i.quantity, 0);
      const total_cp = savedItems.reduce((sum, i) => sum + i.unit_cp * i.quantity, 0);
      const profit = total_sp - total_cp;
      const profit_pct = total_sp > 0
        ? Math.round((profit / total_sp) * 100 * 100) / 100
        : 0;

      await manager.update(Sale, savedSale.id, { total_sp, total_cp, profit, profit_pct });

      // step 4 — assign trucks if provided
      if (dto.trucks?.length) {
        for (const truckDto of dto.trucks) {
          // validate truck exists and is active
          const truck = await manager.findOne(Truck, {
            where: { id: truckDto.truck_id, is_active: false },
          });
          if (!truck) {
            console.log(`Truck validation failed for truck_id ${truckDto.truck_id}`);
            throw new BadRequestException(
              `Truck ${truckDto.truck_id} does not exist or is not active`,
            );
          }

          // 👇 mark truck as busy right after validation
          await manager.update(Truck, truckDto.truck_id, { is_active: true });

          // validate: quantities per sale_item_index must not exceed item quantity
          for (const ti of truckDto.items) {
            const saleItem = dto.items[ti.sale_item_index];
            if (!saleItem) {
              throw new BadRequestException(
                `Invalid sale_item_index: ${ti.sale_item_index}`,
              );
            }

            const totalAssigned = dto.trucks.reduce((sum, t) =>
              sum + t.items
                .filter(i => i.sale_item_index === ti.sale_item_index)
                .reduce((s, i) => s + i.quantity, 0),
              0,
            );

            if (totalAssigned > saleItem.quantity) {
              throw new BadRequestException(
                `Quantities assigned to trucks for item[${ti.sale_item_index}] ` +
                `exceed sale item quantity (${totalAssigned} > ${saleItem.quantity})`,
              );
            }
          }

          const saleTruck = await manager.save(
            manager.create(SaleTruck, {
              sale_id: savedSale.id,
              truck_id: truckDto.truck_id,
              notes: truckDto.notes,
              status: 'pending',
              departed_at: new Date(),
            }),
          );

          const truckItems = truckDto.items.map(ti =>
            manager.create(SaleTruckItem, {
              sale_truck_id: saleTruck.id,
              sale_item_id: savedItems[ti.sale_item_index].id,
              quantity: ti.quantity,
              notes: ti.notes,
            }),
          );

          await manager.save(SaleTruckItem, truckItems);
        }
      }

      // step 0.5 — validate & deduct inventory (throws → rolls back whole tx) ──
      await this.inventoryService.validateAndDeductStock(dto.items, manager, undefined, savedSale.id);

      return manager.findOne(Sale, {
        where: { id: savedSale.id },
        relations: ['items', 'customer', 'trucks', 'trucks.truck', 'trucks.items'],
      });
    });
  }

  async getAllSales(): Promise<Sale[]> {
    return this.saleRepository.find({
      relations: ['items', 'customer', 'trucks', 'trucks.truck', 'trucks.items'],
      order: { sale_date: 'DESC', id: 'DESC' },
    });
  }

  async updateSale(id: number, dto: Partial<CreateSaleDto>): Promise<Sale | null> {
    // STEP 1 — preload Zoho data (outside transaction)
    let itemMap: Map<string, any> | null = null;

    if (dto.items) {
      const zohoItems = await this.getItems();
      itemMap = new Map(zohoItems.map(i => [i.name, i]));
    }

    return this.dataSource.transaction(async manager => {
      const sale = await manager.findOne(Sale, {
        where: { id },
        relations: ['items'],
      });

      if (!sale) throw new Error(`Sale with id ${id} not found`);

      // STEP 2 — update header fields
      const updatePayload: Partial<Sale> = {};
      if (dto.customer_id) updatePayload.customer_id = dto.customer_id;
      if (dto.sale_date) updatePayload.sale_date = dto.sale_date;

      if (Object.keys(updatePayload).length > 0) {
        await manager.update(Sale, id, updatePayload);
      }

      // STEP 3 — replace items if provided
      let newItems: SaleItem[] = sale.items;

      if (dto.items) {
        // 3a — wipe sale_truck_items and sale_trucks first (they reference sale_items)
        const existingItemIds = sale.items.map(i => i.id);

        if (existingItemIds.length > 0) {
          await manager
            .createQueryBuilder()
            .delete()
            .from('sale_truck_items')
            .where('sale_item_id IN (:...ids)', { ids: existingItemIds })
            .execute();
        }

        // 3b — wipe sale_trucks for this sale
        await manager
          .createQueryBuilder()
          .delete()
          .from('sale_trucks')
          .where('sale_id = :id', { id })
          .execute();

        // 3c — wipe and re-insert sale_items
        await manager.delete(SaleItem, { sale_id: id });

        newItems = [];

        for (const item of dto.items) {
          const zohoItem = itemMap!.get(item.dimension);

          if (!zohoItem) {
            throw new Error(`Zoho item not found for dimension: ${item.dimension}`);
          }

          const unit_sp = zohoItem.rate;
          const unit_cp = zohoItem.purchase_rate;

          newItems.push(
            manager.create(SaleItem, {
              sale_id: id,
              dimension: item.dimension,
              quantity: item.quantity,
              unit_sp,
              unit_cp,
              zoho_item_id: zohoItem.item_id,
              name: zohoItem.name,
              line_sp: unit_sp * item.quantity,
              line_cp: unit_cp * item.quantity,
            }),
          );
        }

        newItems = await manager.save(SaleItem, newItems);
      }

      // STEP 4 — re-assign trucks if provided
      if (dto.trucks) {
        if (!dto.items) {
          // trucks provided but items weren't replaced — wipe existing truck assignments first
          const existingItemIds = sale.items.map(i => i.id);

          if (existingItemIds.length > 0) {
            await manager
              .createQueryBuilder()
              .delete()
              .from('sale_truck_items')
              .where('sale_item_id IN (:...ids)', { ids: existingItemIds })
              .execute();
          }

          await manager
            .createQueryBuilder()
            .delete()
            .from('sale_trucks')
            .where('sale_id = :id', { id })
            .execute();
        }

        for (const truckDto of dto.trucks) {
          const saleTruck = await manager.save(SaleTruck,
            manager.create(SaleTruck, {
              sale_id: id,
              truck_id: truckDto.truck_id,
              status: 'pending',
            })
          );

          for (const truckItem of truckDto.items) {
            const targetItem = newItems[truckItem.sale_item_index];

            if (!targetItem) {
              throw new Error(`No sale item at index ${truckItem.sale_item_index}`);
            }

            await manager.save(SaleTruckItem,
              manager.create(SaleTruckItem, {
                sale_truck_id: saleTruck.id,
                sale_item_id: targetItem.id,
                quantity: truckItem.quantity,
                notes: truckItem.notes,
              })
            );
          }
        }
      }

      // STEP 5 — recompute totals
      const total_sp = newItems.reduce((sum, i) => sum + Number(i.line_sp), 0);
      const total_cp = newItems.reduce((sum, i) => sum + Number(i.line_cp), 0);
      const profit = total_sp - total_cp;
      const profit_pct = total_sp > 0
        ? Math.round((profit / total_sp) * 100 * 100) / 100
        : 0;

      await manager.update(Sale, id, { total_sp, total_cp, profit, profit_pct });

      return manager.findOne(Sale, {
        where: { id },
        relations: ['items', 'customer'],
      });
    });
  }
}