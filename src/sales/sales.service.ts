import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { SaleTruck } from '../trucks/entities/sale-truck.entity';
import { SaleTruckItem } from '../trucks/entities/sale-truck-item.entity';
import { Customer } from './entities/customer.entity';
import { Truck } from '../trucks/entities/truck.entity';
import { InventoryService } from '../inventory/inventory.service';
import { TrucksService } from '../trucks/trucks.service';
import { CustomerPriceList } from './entities/customer_pricelist.entity';
import { InventoryItemName } from '../inventory/entities/inventory_items.entity';
import { DIMENSION_TO_ITEM_NAME } from '../inventory/inventory_store.service';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

interface CreateCustomerDto {
  name: string;
  address?: string;
  phone: string;
}

export interface CreateSaleDto {
  customer_id: number;
  sale_date: string;
  items: { dimension: string; quantity: number }[];
  trucks?: CreateSaleTruckDto[];
}

export interface CreateSaleTruckItemDto {
  sale_item_index: number;
  quantity: number;
  notes?: string;
}

export interface CreateSaleTruckDto {
  truck_id: number;
  notes?: string;
  items: CreateSaleTruckItemDto[];
  departed_at?: string;
  arrived_at?: string;
}

export class UpdateCustomerDto {
  name?: string;
  phone?: string;
  prices?: Partial<Record<InventoryItemName, number>>;
}

// ─── Item catalog (was fetched from Zoho, now lives here) ─────────────────────

const ITEM_CATALOG: Record<string, { rate: number; purchase_rate: number; name: string }> = {
  'BLOCK 4 inches': { rate: 29, purchase_rate: 20, name: 'BLOCK 4 inches' },
  'BLOCK 6 inches': { rate: 36, purchase_rate: 26, name: 'BLOCK 6 inches' },
  'BLOCK 8 inches': { rate: 44, purchase_rate: 32, name: 'BLOCK 8 inches' },
};

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    @InjectRepository(Sale)
    private readonly saleRepo: Repository<Sale>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(CustomerPriceList)
    private readonly priceListRepo: Repository<CustomerPriceList>,
    private readonly dataSource: DataSource,
    private readonly inventoryService: InventoryService,
    private readonly trucksService: TrucksService,
  ) { }

  // ─── Catalog ────────────────────────────────────────────────────────────

  getItems(): { rate: number; purchase_rate: number; name: string }[] {
    return Object.values(ITEM_CATALOG);
  }

  private getItemByDimension(dimension: string) {
    const item = ITEM_CATALOG[dimension];
    if (!item) throw new BadRequestException(`Unknown block dimension: ${dimension}`);
    return item;
  }

  // ─── Customers ───────────────────────────────────────────────────────────

  async updateCustomer(id: number, dto: UpdateCustomerDto): Promise<Customer> {
    const { prices, ...customerFields } = dto;

    // update customer fields if any provided
    if (Object.keys(customerFields).length > 0) {
      await this.customerRepo.update(id, customerFields);
    }

    // upsert each price if provided
    if (prices) {
      await Promise.all(
        Object.entries(prices).map(([itemName, price]) => {
          const mappedItemName = DIMENSION_TO_ITEM_NAME[itemName];

          if (!mappedItemName) {
            throw new BadRequestException(
              `Invalid item name: "${itemName}". Allowed values: ${Object.keys(DIMENSION_TO_ITEM_NAME).join(', ')}`,
            );
          }

          return this.priceListRepo.upsert(
            { customer: { id }, itemName: mappedItemName, price },
            ['customer', 'itemName'],
          );
        }),
      );
    }
    // return fresh record with updated price list
    return this.customerRepo.findOneOrFail({
      where: { id },
      relations: { priceLists: true },
    });
  }

  async getCustomers(): Promise<Customer[]> {
    return this.customerRepo.find({
      relations: { priceLists: true },
      order: { name: 'ASC' },
    });
  }

  async getCustomer(id: number): Promise<Customer | null> {
    return this.customerRepo.findOne({
      relations: { sales: true, priceLists: true },
      where: { id }
    })
  }

  async createCustomer(data: CreateCustomerDto): Promise<Customer> {
    const { name, phone } = data;

    if (!name || !phone) {
      throw new BadRequestException('Both name and phone are required');
    }

    const existing = await this.customerRepo.findOne({ where: { phone } });
    if (existing) return existing;

    return this.customerRepo.save(this.customerRepo.create({ name, phone }));
  }

  // ─── Sales reads ────────────────────────────────────────────────────────

  async getSaleById(id: number): Promise<Sale> {
    const sale = await this.saleRepo.findOne({
      where: { id },
      relations: { customer: true, items: true, trucks: { truck: true, items: true } },
    });
    if (!sale) throw new NotFoundException(`Sale #${id} not found`);
    return sale;
  }

  async getAllSales(): Promise<Sale[]> {
    return this.saleRepo.find({
      relations: ['items', 'customer', 'trucks', 'trucks.truck', 'trucks.items'],
      order: { sale_date: 'DESC', id: 'DESC' },
    });
  }

  // ─── createSale ──────────────────────────────────────────────────────────

  async createSale(dto: CreateSaleDto): Promise<Sale | null> {
    return this.dataSource.transaction(async manager => {
      const { sale_date } = dto;

      // ── Invoice number ──────────────────────────────────────────────────
      const countToday = await manager.count(Sale, { where: { sale_date } });
      const invoice_no = `INV-${sale_date.replace(/-/g, '')}-${String(countToday + 1).padStart(3, '0')}`;

      // ── Sale header ─────────────────────────────────────────────────────
      const savedSale = await manager.save(
        Sale,
        manager.create(Sale, { customer_id: dto.customer_id, sale_date, invoice_no }),
      );

      const normalizeItemName = (name: string) =>
        name.toUpperCase().replace(/\s+/g, '_');

      // ── Customer price list (fetch once, key by itemName) ───────────────
      const customerPriceMap = new Map<string, number>();
      if (dto.customer_id) {
        const customerPrices = await manager.find(CustomerPriceList, {
          where: { customer: { id: dto.customer_id} },
        });
        console.log({ customer_id: dto.customer_id, customerPrices });
        for (const cp of customerPrices) {
          customerPriceMap.set(normalizeItemName(cp.itemName), Number(cp.price));
        }
      }

      // ── Sale items ──────────────────────────────────────────────────────
      const savedItems = await manager.save(
        SaleItem,
        dto.items.map(item => {
          const catalog = this.getItemByDimension(item.dimension);
          console.log({
            catalogName: catalog.name,
            normalized: normalizeItemName(catalog.name),
            mapKeys: [...customerPriceMap.keys()],
          });

          const unit_sp = customerPriceMap.get(normalizeItemName(catalog.name)) ?? catalog.rate;

          return manager.create(SaleItem, {
            sale_id: savedSale.id,
            dimension: item.dimension,
            quantity: item.quantity,
            name: catalog.name,
            unit_sp,
            unit_cp: catalog.purchase_rate,
            line_sp: unit_sp * item.quantity,
            line_cp: catalog.purchase_rate * item.quantity,
          });
        }),
      );

      // ── Inventory deduction (inside tx — throws rolls everything back) ──
      await this.inventoryService.validateAndDeductStock(
        dto.items,
        `Sale ${invoice_no}`,
        'watchman',
        manager,
      );

      // ── Trucks ──────────────────────────────────────────────────────────
      if (dto.trucks?.length) {
        await this.trucksService.assignTrucksToSale(manager, savedSale.id, savedItems, dto.items, dto.trucks);
      }

      return manager.findOne(Sale, {
        where: { id: savedSale.id },
        relations: ['items', 'customer', 'trucks', 'trucks.truck', 'trucks.items'],
      });
    });
  }
  // ─── updateSale ──────────────────────────────────────────────────────────

  async updateSale(id: number, dto: Partial<CreateSaleDto>): Promise<Sale | null> {
    return this.dataSource.transaction(async manager => {
      const sale = await manager.findOne(Sale, { where: { id }, relations: ['items'] });
      if (!sale) throw new NotFoundException(`Sale #${id} not found`);

      // ── Header ──────────────────────────────────────────────────────────
      const patch: Partial<Sale> = {};
      if (dto.customer_id) patch.customer_id = dto.customer_id;
      if (dto.sale_date) patch.sale_date = dto.sale_date;
      if (Object.keys(patch).length) await manager.update(Sale, id, patch);

      // ── Items ───────────────────────────────────────────────────────────
      let currentItems: SaleItem[] = sale.items;

      if (dto.items) {
        // wipe truck assignments that reference old sale_items
        const oldItemIds = sale.items.map(i => i.id);
        if (oldItemIds.length) {
          await manager
            .createQueryBuilder()
            .delete()
            .from('sale_truck_items')
            .where('sale_item_id IN (:...ids)', { ids: oldItemIds })
            .execute();
        }
        await manager.createQueryBuilder().delete().from('sale_trucks').where('sale_id = :id', { id }).execute();
        await manager.delete(SaleItem, { sale_id: id });

        currentItems = await manager.save(
          SaleItem,
          dto.items.map(item => {
            const catalog = this.getItemByDimension(item.dimension);
            return manager.create(SaleItem, {
              sale_id: id,
              dimension: item.dimension,
              quantity: item.quantity,
              name: catalog.name,
              unit_sp: catalog.rate,
              line_sp: catalog.rate * item.quantity,
            });
          }),
        );
      }

      // ── Trucks ──────────────────────────────────────────────────────────
      if (dto.trucks) {
        if (!dto.items) {
          // trucks-only update — wipe existing assignments first
          const oldItemIds = sale.items.map(i => i.id);
          if (oldItemIds.length) {
            await manager
              .createQueryBuilder()
              .delete()
              .from('sale_truck_items')
              .where('sale_item_id IN (:...ids)', { ids: oldItemIds })
              .execute();
          }
          await manager.createQueryBuilder().delete().from('sale_trucks').where('sale_id = :id', { id }).execute();
        }

        await this.trucksService.assignTrucksToSale(manager, id, currentItems, dto.items ?? sale.items.map(i => ({ dimension: i.dimension, quantity: i.quantity })), dto.trucks, true);
      }

      return manager.findOne(Sale, {
        where: { id },
        relations: ['items', 'customer', 'trucks', 'trucks.truck', 'trucks.items'],
      });
    });
  }

}