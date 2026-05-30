import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Watchman_Logs } from './entities/watchman-log.entity';
import { Watchman_Log_Item } from './entities/watchman-log-items.entity';
import { WatchmanLogTruck } from '../trucks/entities/watchmanlog-truck.entity';
import { WatchmanLogTruckItem } from '../trucks/entities/watchmanlog-truck-item.entity';
import { Customer } from './entities/customer.entity';
import { Truck } from '../trucks/entities/truck.entity';
import { InventoryService } from '../inventory/inventory.service';
import { TrucksService } from '../trucks/trucks.service';
import { CustomerPriceList } from './entities/customer_pricelist.entity';
import { InventoryItemName } from '../inventory/entities/inventory_items.entity';
import { DIMENSION_TO_ITEM_NAME } from '../inventory/inventory_store.service';
import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsNumber, IsString, Min, ValidateNested, ArrayNotEmpty, IsArray } from 'class-validator';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export class CreatePriceListDto {
  @IsEnum(InventoryItemName)
  itemName!: InventoryItemName;

  @IsNumber()
  @Min(0)
  price!: number;
}

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreatePriceListDto)
  priceLists!: CreatePriceListDto[];
}

export interface CreateWatchmanLogDto {
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
export class WatchmanLogsService {
  private readonly logger = new Logger(WatchmanLogsService.name);

  constructor(
    @InjectRepository(Watchman_Logs)
    private readonly watchmanLogRepo: Repository<Watchman_Logs>,
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
      relations: { watchmanLogs: true, priceLists: true },
      where: { id }
    })
  }

  async createCustomer(data: CreateCustomerDto): Promise<Customer | null> {
    const { name, phone, priceLists } = data;

    const existing = await this.customerRepo.findOne({ where: { phone } });
    if (existing) {
      throw new BadRequestException(`A customer with phone ${phone} already exists.`);
    }

    const customer = await this.customerRepo.save(
      this.customerRepo.create({ name, phone })
    );

    const priceEntities = priceLists.map((entry) =>
      this.priceListRepo.create({
        customer,
        itemName: entry.itemName,
        price: entry.price,
      })
    );

    await this.priceListRepo.save(priceEntities);

    return this.customerRepo.findOne({
      where: { id: customer.id },
      relations: ['priceLists'],
    });
  }

  // ─── Sales reads ────────────────────────────────────────────────────────

  async getWatchmanLogById(id: number): Promise<Watchman_Logs> {
    const watchmanLog = await this.watchmanLogRepo.findOne({
      where: { id },
      relations: { customer: true, items: true, trucks: { truck: true, items: true } },
    });
    if (!watchmanLog) throw new NotFoundException(`Watchman Log #${id} not found`);
    return watchmanLog;
  }

  async getAllWatchmanLogs(): Promise<Watchman_Logs[]> {
    return this.watchmanLogRepo.find({
      relations: ['items', 'customer', 'trucks', 'trucks.truck', 'trucks.items'],
      order: { sale_date: 'DESC', id: 'DESC' },
    });
  }

  // ─── createWatchmanLog ──────────────────────────────────────────────────

  async createWatchmanLog(dto: CreateWatchmanLogDto): Promise<Watchman_Logs | null> {
    return this.dataSource.transaction(async manager => {
      const { sale_date } = dto;

      // ── Watchman Log header ─────────────────────────────────────────────
      const savedSale = await manager.save(
        Watchman_Logs,
        manager.create(Watchman_Logs, { customer_id: dto.customer_id, sale_date }),
      );

      const normalizeItemName = (name: string) =>
        name.toUpperCase().replace(/\s+/g, '_');

      // ── Customer price list (fetch once, key by itemName) ───────────────
      const customerPriceMap = new Map<string, number>();
      if (dto.customer_id) {
        const customerPrices = await manager.find(CustomerPriceList, {
          where: { customer: { id: dto.customer_id } },
        });
        console.log({ customer_id: dto.customer_id, customerPrices });
        for (const cp of customerPrices) {
          customerPriceMap.set(normalizeItemName(cp.itemName), Number(cp.price));
        }
      }

      // ── Sale items ──────────────────────────────────────────────────────
      const savedItems = await manager.save(
        Watchman_Log_Item,
        dto.items.map(item => {
          const catalog = this.getItemByDimension(item.dimension);
          console.log({
            catalogName: catalog.name,
            normalized: normalizeItemName(catalog.name),
            mapKeys: [...customerPriceMap.keys()],
          });

          const unit_sp = customerPriceMap.get(normalizeItemName(catalog.name)) ?? catalog.rate;

          return manager.create(Watchman_Log_Item, {
            watchman_log_id: savedSale.id,
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
        `Sale ${savedSale.invoice_no}`,
        'watchman',
        manager,
      );

      // ── Trucks ──────────────────────────────────────────────────────────
      if (dto.trucks?.length) {
        await this.trucksService.assignTrucksToSale(manager, savedSale.id, savedItems, dto.items, dto.trucks);
      }

      return manager.findOne(Watchman_Logs, {
        where: { id: savedSale.id },
        relations: ['items', 'customer', 'trucks', 'trucks.truck', 'trucks.items'],
      });
    });
  }

}