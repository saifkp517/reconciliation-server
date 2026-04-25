import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Inventory, VALID_DIMENSIONS, InventoryKey } from './entities/inventory.entity';
import {
  AddBlockStockDto,
  AddCementBagsDto,
  UpdateBlockStockDto,
} from './dto/inventory.dto';
import { InventoryLog } from './entities/inventory-log.entity';
import { CreateInventoryLogDto } from './dto/inventory-log.dto';
import { InventoryLogItem } from './entities/inventory-log-item.entity';

@Injectable()
export class InventoryService implements OnModuleInit {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepo: Repository<Inventory>,

    @InjectDataSource()
    private readonly dataSource: DataSource,

    @InjectRepository(InventoryLog)
    private readonly inventoryLogRepo: Repository<InventoryLog>,
  ) { }

  // ---------------------------------------------------------------------------
  // Bootstrap — seed inventory rows if they don't exist yet
  // ---------------------------------------------------------------------------
  async onModuleInit() {
    await this.seedInventory();
  }

  private async seedInventory() {
    const keys: { key: InventoryKey; label: string }[] = [
      ...VALID_DIMENSIONS.map(d => ({ key: d as InventoryKey, label: d })),
      { key: 'CEMENT_BAGS', label: 'Cement Bags' },
    ];

    for (const { key, label } of keys) {
      const exists = await this.inventoryRepo.findOneBy({ key });
      if (!exists) {
        await this.inventoryRepo.save(
          this.inventoryRepo.create({ key, label, quantity: 0 }),
        );
        this.logger.log(`Seeded inventory row: ${key}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // READ
  // ---------------------------------------------------------------------------
  async getAll(): Promise<Inventory[]> {
    return this.inventoryRepo.find({ order: { key: 'ASC' } });
  }

  async getByKey(key: InventoryKey): Promise<Inventory> {
    const row = await this.inventoryRepo.findOneBy({ key });
    if (!row) throw new BadRequestException(`Inventory key "${key}" not found`);
    return row;
  }

  // ---------------------------------------------------------------------------
  // UPDATE — set absolute quantity (e.g. full stock-take)
  // ---------------------------------------------------------------------------
  async setBlockStock(dto: UpdateBlockStockDto): Promise<Inventory> {
    const row = await this.getByKey(dto.dimension as InventoryKey);
    row.quantity = dto.quantity;
    return this.inventoryRepo.save(row);
  }

  // ---------------------------------------------------------------------------
  // ADD — increment quantity (daily factory production)
  // ---------------------------------------------------------------------------
  async manufactureBlocks(dto: AddBlockStockDto): Promise<Inventory> {

    const queryRunner = await this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const row = await queryRunner.manager.findOne(Inventory, {
        where: { key: dto.dimension as InventoryKey },
        lock: { mode: 'pessimistic_write' }, // prevents race conditions
      });

      const cementBags = await queryRunner.manager.findOne(Inventory, {
        where: { key: 'CEMENT_BAGS' },
        lock: { mode: 'pessimistic_write' },
      });


      if (!row || !cementBags) {
        throw new NotFoundException('Inventory item not found');
      }

      if (cementBags.quantity < dto.cementBagsUsed) {
        throw new BadRequestException(
          `Insufficient cement bags: required ${dto.cementBagsUsed}, available ${cementBags.quantity}`,
        );
      }

      row.quantity += dto.amount;
      cementBags.quantity -= dto.cementBagsUsed;

      const log = new InventoryLog();
      log.transaction_type = 'PRODUCTION';
      log.note = `Manufactured ${dto.amount} blocks of dimension ${dto.dimension}`;

      log.items = [
        {
          inventory_key: dto.dimension as InventoryKey,
          delta: dto.amount, // stock added
        } as InventoryLogItem,
        {
          inventory_key: 'CEMENT_BAGS',
          delta: -dto.cementBagsUsed, // stock consumed
        } as InventoryLogItem,
      ];

      await queryRunner.manager.save(row);
      await queryRunner.manager.save(cementBags);
      await queryRunner.manager.save(log);

      await queryRunner.commitTransaction();

      return row;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async addCementBags(dto: AddCementBagsDto): Promise<Inventory> {
    const row = await this.getByKey('CEMENT_BAGS');
    row.quantity += dto.amount;
    return this.inventoryRepo.save(row);
  }

  // ---------------------------------------------------------------------------
  // TRANSACTIONAL helpers — called from SalesService inside its transaction
  // ---------------------------------------------------------------------------

  /**
   * Validate that every sale item dimension has sufficient stock.
   * Throws BadRequestException (rolls back the transaction) if not.
   *
   * @param items  Array of { dimension, quantity } from the sale DTO
   * @param manager  The EntityManager from the parent transaction
   */
  async validateAndDeductStock(
    items: { dimension: string; quantity: number }[],
    manager: EntityManager,
    note?: string,
    saleId?: number,
  ): Promise<void> {
    // Aggregate quantities per dimension (one sale may have duplicate dimensions)
    const needed = new Map<string, number>();
    for (const item of items) {
      needed.set(item.dimension, (needed.get(item.dimension) ?? 0) + item.quantity);
    }

    for (const [dimension, qty] of needed.entries()) {
      // Lock the row for update to avoid race conditions
      const row = await manager
        .getRepository(Inventory)
        .createQueryBuilder('inv')
        .setLock('pessimistic_write')
        .where('inv.key = :key', { key: dimension })
        .getOne();

      if (!row) {
        throw new BadRequestException(
          `Inventory not configured for dimension "${dimension}"`,
        );
      }

      if (row.quantity < qty) {
        throw new BadRequestException(
          `Insufficient stock for "${dimension}": ` +
          `required ${qty}, available ${row.quantity}`,
        );
      }

      await manager.decrement(Inventory, { key: dimension }, 'quantity', qty);
    }

    // Log the deduction
    const logItems = [...needed.entries()].map(([key, qty]) => {
      const item = new InventoryLogItem();
      item.inventory_key = key as InventoryKey;
      item.delta = -qty;
      return item;
    });

    const log = new InventoryLog();
    log.transaction_type = 'DELIVERY';
    log.note = note ?? 'Stock deducted from sale';
    log.items = logItems;
    log.sale_id = saleId;

    await manager.getRepository(InventoryLog).save(log);
  }

  async createLog(dto: CreateInventoryLogDto): Promise<InventoryLog> {
    return this.dataSource.transaction(async manager => {
      // 1. Validate all keys exist and deltas won't drive stock negative
      for (const item of dto.items) {
        const row = await manager
          .getRepository(Inventory)
          .createQueryBuilder('inv')
          .setLock('pessimistic_write')
          .where('inv.key = :key', { key: item.inventory_key })
          .getOne();

        if (!row) {
          throw new BadRequestException(
            `Unknown inventory key: "${item.inventory_key}"`,
          );
        }

        const projected = row.quantity + item.delta;
        if (projected < 0) {
          throw new BadRequestException(
            `Insufficient stock for "${item.inventory_key}": ` +
            `available ${row.quantity}, delta ${item.delta} would result in ${projected}`,
          );
        }
      }

      // 2. Apply deltas to inventory table
      for (const item of dto.items) {
        await manager.increment(
          Inventory,
          { key: item.inventory_key },
          'quantity',
          item.delta, // increment works with negatives
        );
      }

      // 3. Persist the log + its items in one shot (cascade: true)
      const log = manager.getRepository(InventoryLog).create({
        transaction_type: dto.transaction_type,
        note: dto.note,
        items: dto.items.map(i =>
          manager.getRepository(InventoryLogItem).create({
            inventory_key: i.inventory_key,
            delta: i.delta,
          }),
        ),
      });

      return manager.getRepository(InventoryLog).save(log);
    });
  }

  async getLogs(): Promise<InventoryLog[]> {
    return this.inventoryLogRepo.find({
      relations: { items: true },
      order: { created_at: 'DESC' },
    });
  }
}