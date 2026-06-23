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
import { InventoryItem } from '../inventory/entities/inventory_items.entity';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString, IsOptional, Min, ValidateNested, ArrayNotEmpty, IsArray } from 'class-validator';
import { COMPANY_PREFIX, getFiscalYear, nextInvoiceSeq } from '../bills/invoice.util';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export class CreatePriceListDto {
  @IsString()
  @IsNotEmpty()
  itemName!: string;

  @IsNumber()
  @Min(0)
  price!: number;
}

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  mobile?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  company_name?: string;

  @IsString()
  @IsOptional()
  customer_type?: string;

  @IsString()
  @IsOptional()
  gst_treatment?: string;

  @IsString()
  @IsOptional()
  gstin?: string;

  @IsString()
  @IsOptional()
  pan?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  shipping_address?: string;

  @IsNumber()
  @IsOptional()
  billing_lat?: number;

  @IsNumber()
  @IsOptional()
  billing_lng?: number;

  @IsNumber()
  @IsOptional()
  shipping_lat?: number;

  @IsNumber()
  @IsOptional()
  shipping_lng?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreatePriceListDto)
  priceLists?: CreatePriceListDto[];
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
  address?: string;
  prices?: Record<string, number>;
}

export class BulkUpdateWatchmanLogDto {
  id!: number;
  sale_date?: string;
  customer_id?: number;
}

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

  async getItems(): Promise<InventoryItem[]> {
    return this.inventoryService.getAllStock();
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
        Object.entries(prices).map(([itemName, price]) =>
          this.priceListRepo.upsert(
            { customer: { id }, itemName, price },
            ['customer', 'itemName'],
          ),
        ),
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
    const { priceLists, ...customerFields } = data;

    if (customerFields.phone && customerFields.phone.trim()) {
      const existing = await this.customerRepo.findOne({ where: { phone: customerFields.phone } });
      if (existing) {
        throw new BadRequestException(`A customer with phone ${customerFields.phone} already exists.`);
      }
    }

    const customer = await this.customerRepo.save(
      this.customerRepo.create(customerFields)
    );

    if (priceLists?.length) {
      const priceEntities = priceLists.map((entry) =>
        this.priceListRepo.create({
          customer,
          itemName: entry.itemName,
          price: entry.price,
        })
      );
      await this.priceListRepo.save(priceEntities);
    }

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

      // ── Assign fiscal invoice number ────────────────────────────────────
      const fiscalYear = getFiscalYear(sale_date);
      const fiscal_seq = await nextInvoiceSeq(manager, 'WL', fiscalYear);
      const invoice_no = `${COMPANY_PREFIX}/WL/${fiscalYear}/${fiscal_seq}`;

      // ── Watchman Log header ─────────────────────────────────────────────
      const savedSale = await manager.save(
        Watchman_Logs,
        manager.create(Watchman_Logs, { customer_id: dto.customer_id, sale_date, fiscal_seq, invoice_no }),
      );

      // ── Fetch inventory items + customer prices in parallel ─────────────
      const dimensionNames = [...new Set(dto.items.map(i => i.dimension))];
      const [inventoryItems, customerPrices] = await Promise.all([
        manager.find(InventoryItem, { where: dimensionNames.map(name => ({ name })) }),
        manager.find(CustomerPriceList, { where: { customer: { id: dto.customer_id } } }),
      ]);

      const inventoryMap = new Map(inventoryItems.map(i => [i.name, i]));
      const customerPriceMap = new Map(customerPrices.map(cp => [cp.itemName, Number(cp.price)]));

      // ── Sale items ──────────────────────────────────────────────────────
      const savedItems = await manager.save(
        Watchman_Log_Item,
        dto.items.map(item => {
          const inventoryItem = inventoryMap.get(item.dimension);
          if (!inventoryItem) throw new BadRequestException(`Unknown item: ${item.dimension}`);

          const unit_cp = Number(inventoryItem.unitPrice);
          const unit_sp = customerPriceMap.get(item.dimension) ?? unit_cp;

          return manager.create(Watchman_Log_Item, {
            watchman_log_id: savedSale.id,
            dimension: item.dimension,
            quantity: item.quantity,
            name: inventoryItem.name,
            unit_sp,
            unit_cp,
            line_sp: unit_sp * item.quantity,
            line_cp: unit_cp * item.quantity,
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

  async bulkUpdate(updates: BulkUpdateWatchmanLogDto[]): Promise<Watchman_Logs[]> {
    const repo = this.watchmanLogRepo;

    return Promise.all(
      updates.map(async ({ id, ...fields }) => {
        const log = await repo.findOne({
          where: { id },
          relations: ['items', 'customer', 'trucks', 'trucks.truck', 'trucks.items'],
        });
        if (!log) throw new NotFoundException(`Watchman Log #${id} not found`);
        Object.assign(log, fields);
        return repo.save(log);
      }),
    );
  }

}