import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Watchman_Logs } from './entities/watchman-log.entity';
import { Watchman_Log_Item } from './entities/watchman-log-items.entity';
import { WatchmanLogTruck } from '../trucks/entities/watchmanlog-truck.entity';
import { WatchmanLogTruckItem } from '../trucks/entities/watchmanlog-truck-item.entity';
import { Truck } from '../trucks/entities/truck.entity';
import { InventoryService } from '../inventory/inventory.service';
import { TrucksService } from '../trucks/trucks.service';
import { CustomerPriceList } from '../customers/entities/customer_pricelist.entity';
import { InventoryItem } from '../inventory/entities/inventory_items.entity';
import { COMPANY_PREFIX, getFiscalYear, nextInvoiceSeq } from '../bills/invoice.util';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateWatchmanLogDto {
  customer_id: number;
  sale_date: string;
  items: { itemId: number; quantity: number }[];
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

export interface UpdateWatchmanLogItemDto {
  id?: number;       // existing line item id; omit to add new
  itemId: number;
  quantity: number;
  unit_sp?: number;
}

export interface UpdateSaleTruckItemDto {
  watchman_log_item_id: number;
  quantity: number;
  notes?: string;
}

export interface UpdateSaleTruckDto {
  id?: number;      // existing watchman_log_truck id; omit to add new
  truck_id: number;
  notes?: string;
  departed_at?: string;
  arrived_at?: string;
  status?: string;
  items?: UpdateSaleTruckItemDto[];
}

export interface UpdateWatchmanLogDto {
  sale_date?: string;
  customer_id?: number;
  items?: UpdateWatchmanLogItemDto[];
  trucks?: UpdateSaleTruckDto[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class WatchmanLogsService {
  private readonly logger = new Logger(WatchmanLogsService.name);

  constructor(
    @InjectRepository(Watchman_Logs)
    private readonly watchmanLogRepo: Repository<Watchman_Logs>,
    private readonly dataSource: DataSource,
    private readonly inventoryService: InventoryService,
    private readonly trucksService: TrucksService,
  ) {}

  // ─── Catalog ────────────────────────────────────────────────────────────

  async getItems(): Promise<InventoryItem[]> {
    return this.inventoryService.getAllItems('product');
  }

  // ─── Sales reads ────────────────────────────────────────────────────────

  async getWatchmanLogById(id: number): Promise<Watchman_Logs> {
    const watchmanLog = await this.watchmanLogRepo.findOne({
      where: { id },
      relations: { customer: true, items: { item: true }, trucks: { truck: true, items: true } },
    });
    if (!watchmanLog) throw new NotFoundException(`Watchman Log #${id} not found`);
    return watchmanLog;
  }

  async getAllWatchmanLogs(): Promise<Watchman_Logs[]> {
    return this.watchmanLogRepo.find({
      relations: ['items', 'items.item', 'customer', 'trucks', 'trucks.truck', 'trucks.items'],
      order: { sale_date: 'DESC', id: 'DESC' },
    });
  }

  // ─── createWatchmanLog ──────────────────────────────────────────────────

  async createWatchmanLog(dto: CreateWatchmanLogDto): Promise<Watchman_Logs | null> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const manager = queryRunner.manager;
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
      const itemIds = [...new Set(dto.items.map(i => i.itemId))];
      const [inventoryItems, customerPrices] = await Promise.all([
        manager.find(InventoryItem, { where: { id: In(itemIds) } }),
        manager.find(CustomerPriceList, { where: { customer: { id: dto.customer_id } } }),
      ]);

      const inventoryMap = new Map(inventoryItems.map(i => [i.id, i]));
      const customerPriceMap = new Map(customerPrices.map(cp => [cp.itemName, Number(cp.price)]));

      // ── Sale items ──────────────────────────────────────────────────────
      const savedItems = await manager.save(
        Watchman_Log_Item,
        dto.items.map(item => {
          const inventoryItem = inventoryMap.get(item.itemId);
          if (!inventoryItem) throw new BadRequestException(`Unknown item id: ${item.itemId}`);
          if (inventoryItem.type !== 'product') throw new BadRequestException(`Item ${inventoryItem.name} is not a sellable product`);

          const unit_cp = Number(inventoryItem.unitPrice);
          const unit_sp = customerPriceMap.get(inventoryItem.name) ?? unit_cp;

          return manager.create(Watchman_Log_Item, {
            watchman_log_id: savedSale.id,
            itemId: item.itemId,
            quantity: item.quantity,
            unit_sp,
            line_sp: unit_sp * item.quantity,
          });
        }),
      );

      // ── Inventory deduction (per item, inside tx) ───────────────────────
      for (const item of dto.items) {
        await this.inventoryService.deductStock(
          item.itemId,
          item.quantity,
          manager,
          `Sale ${invoice_no}`,
        );
      }

      // ── Trucks ──────────────────────────────────────────────────────────
      if (dto.trucks?.length) {
        await this.trucksService.assignTrucksToSale(manager, savedSale.id, savedItems, dto.items, dto.trucks);
      }

      const result = await manager.findOne(Watchman_Logs, {
        where: { id: savedSale.id },
        relations: ['items', 'items.item', 'customer', 'trucks', 'trucks.truck', 'trucks.items'],
      });

      await queryRunner.commitTransaction();

      return result;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async updateOne(id: number, dto: UpdateWatchmanLogDto): Promise<Watchman_Logs> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const manager = queryRunner.manager;

      const log = await manager.findOne(Watchman_Logs, {
        where: { id },
        relations: ['items', 'items.item', 'customer', 'trucks', 'trucks.truck', 'trucks.items'],
      });
      if (!log) throw new NotFoundException(`Watchman Log #${id} not found`);

      // ── Header fields ───────────────────────────────────────────────────
      if (dto.sale_date !== undefined) log.sale_date = dto.sale_date;
      if (dto.customer_id !== undefined) log.customer_id = dto.customer_id;
      await manager.save(Watchman_Logs, log);

      // ── Line items ──────────────────────────────────────────────────────
      if (dto.items !== undefined) {
        const existingItems = log.items ?? [];
        const existingMap = new Map(existingItems.map(i => [i.id, i]));
        const incomingIds = new Set(dto.items.filter(i => i.id != null).map(i => i.id!));

        // Removed items → delete child truck_items first, then restore stock
        for (const existing of existingItems) {
          if (!incomingIds.has(existing.id)) {
            await manager.delete(WatchmanLogTruckItem, { watchman_log_item_id: existing.id });
            await this.inventoryService.addStock(
              existing.itemId!,
              existing.quantity,
              manager,
              `Edit ${log.invoice_no} (remove item)`,
            );
            await manager.remove(Watchman_Log_Item, existing);
          }
        }

        // Fetch inventory items for price lookup
        const itemIds = [...new Set(dto.items.map(i => i.itemId))];
        const [inventoryItems, customerPrices] = await Promise.all([
          manager.find(InventoryItem, { where: { id: In(itemIds) } }),
          manager.find(CustomerPriceList, { where: { customer: { id: log.customer_id } } }),
        ]);
        const inventoryMap = new Map(inventoryItems.map(i => [i.id, i]));
        const customerPriceMap = new Map(customerPrices.map(cp => [cp.itemName, Number(cp.price)]));

        for (const incoming of dto.items) {
          const inventoryItem = inventoryMap.get(incoming.itemId);
          if (!inventoryItem) throw new BadRequestException(`Unknown item id: ${incoming.itemId}`);
          if (inventoryItem.type !== 'product') throw new BadRequestException(`Item ${inventoryItem.name} is not a sellable product`);

          const unit_sp = incoming.unit_sp
            ?? customerPriceMap.get(inventoryItem.name)
            ?? Number(inventoryItem.unitPrice);

          if (incoming.id != null && existingMap.has(incoming.id)) {
            // Update existing item
            const existing = existingMap.get(incoming.id)!;

            if (existing.itemId !== incoming.itemId) {
              // Item swapped: restore old item's stock fully, deduct new item's stock fully
              await this.inventoryService.addStock(existing.itemId!, existing.quantity, manager, `Edit ${log.invoice_no} (item swap)`);
              await this.inventoryService.deductStock(incoming.itemId, incoming.quantity, manager, `Edit ${log.invoice_no} (item swap)`);
            } else {
              const qtyDiff = incoming.quantity - existing.quantity;
              if (qtyDiff > 0) {
                await this.inventoryService.deductStock(incoming.itemId, qtyDiff, manager, `Edit ${log.invoice_no}`);
              } else if (qtyDiff < 0) {
                await this.inventoryService.addStock(incoming.itemId, -qtyDiff, manager, `Edit ${log.invoice_no}`);
              }
            }

            existing.itemId = incoming.itemId;
            existing.item = inventoryItem;
            existing.quantity = incoming.quantity;
            existing.unit_sp = unit_sp;
            existing.line_sp = unit_sp * incoming.quantity;
            await manager.save(Watchman_Log_Item, existing);
          } else {
            // New item
            await this.inventoryService.deductStock(incoming.itemId, incoming.quantity, manager, `Edit ${log.invoice_no}`);
            await manager.save(
              Watchman_Log_Item,
              manager.create(Watchman_Log_Item, {
                watchman_log_id: id,
                itemId: incoming.itemId,
                quantity: incoming.quantity,
                unit_sp,
                line_sp: unit_sp * incoming.quantity,
              }),
            );
          }
        }
      }

      // ── Trucks ──────────────────────────────────────────────────────────
      if (dto.trucks !== undefined) {
        await this.trucksService.updateTrucksForSale(manager, id, dto.trucks);
      }

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    return this.watchmanLogRepo.findOne({
      where: { id },
      relations: ['items', 'items.item', 'customer', 'trucks', 'trucks.truck', 'trucks.items'],
    }) as Promise<Watchman_Logs>;
  }

}
