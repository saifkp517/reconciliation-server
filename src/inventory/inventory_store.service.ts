import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
    ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InventoryTransaction, TransactionReason } from './entities/inventory_transactions.entity';
import { InventoryItem } from './entities/inventory_items.entity';

@Injectable()
export class InventoryStoreService {
    private readonly logger = new Logger(InventoryStoreService.name);

    constructor(
        @InjectRepository(InventoryItem)
        private readonly itemRepo: Repository<InventoryItem>,

        @InjectRepository(InventoryTransaction)
        private readonly txRepo: Repository<InventoryTransaction>,

        private readonly dataSource: DataSource,
    ) { }

    private async applyAdjustments(
        adjustments: { itemId: number; delta: number }[],
        reason: TransactionReason,
        notes?: string,
        loggedBy?: string,
        manager?: EntityManager,
    ): Promise<void> {
        const run = async (manager: EntityManager) => {
            for (const { itemId, delta } of adjustments) {
                const item = await manager
                    .getRepository(InventoryItem)
                    .createQueryBuilder('item')
                    .setLock('pessimistic_write')
                    .where('item.id = :id', { id: itemId })
                    .getOne();

                if (!item) throw new NotFoundException(`Inventory item not found: ${itemId}`);

                const newStock = Number(item.stock) + delta;
                item.stock = newStock;
                await manager.save(InventoryItem, item);

                const tx = manager.getRepository(InventoryTransaction).create({
                    itemId: item.id,
                    quantityDelta: delta,
                    stockAfter: newStock,
                    reason,
                    notes: notes ?? null,
                    loggedBy: loggedBy ?? null,
                });
                await manager.save(InventoryTransaction, tx);

                this.logger.log(
                    `📦 ${reason} | ${item.name} | delta: ${delta > 0 ? '+' : ''}${delta} | stock now: ${newStock}`,
                );
            }
        };

        if (manager) {
            await run(manager);
        } else {
            await this.dataSource.transaction('SERIALIZABLE', run);
        }
    }

    // ─── Items ────────────────────────────────────────────────────────────────

    async getAllItems(type?: 'raw_material' | 'product'): Promise<InventoryItem[]> {
        const where = type ? { type } : {};
        return this.itemRepo.find({ where, order: { name: 'ASC' } });
    }

    async getItemById(id: number): Promise<InventoryItem> {
        const item = await this.itemRepo.findOne({ where: { id } });
        if (!item) throw new NotFoundException(`Inventory item not found: ${id}`);
        return item;
    }

    async createItem(
        name: string,
        type: 'raw_material' | 'product',
        unit?: string,
        price?: number,
    ): Promise<InventoryItem> {
        const existing = await this.itemRepo.findOne({ where: { name } });
        if (existing) throw new ConflictException('ITEM_ALREADY_EXISTS');

        const item = this.itemRepo.create({
            name,
            type,
            unit: unit ?? null,
            unitPrice: price ?? 0,
            stock: 0,
        });
        return this.itemRepo.save(item);
    }

    async deleteItem(id: number): Promise<void> {
        const item = await this.itemRepo.findOne({ where: { id } });
        if (!item) throw new NotFoundException(`Inventory item not found: ${id}`);
        await this.itemRepo.remove(item);
    }

    async setQuantityById(id: number, newQty: number, loggedBy?: string): Promise<InventoryItem> {
        return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
            const item = await manager
                .getRepository(InventoryItem)
                .createQueryBuilder('item')
                .setLock('pessimistic_write')
                .where('item.id = :id', { id })
                .getOne();

            if (!item) throw new NotFoundException(`Inventory item not found: ${id}`);

            const delta = newQty - Number(item.stock);
            item.stock = newQty;
            await manager.save(InventoryItem, item);

            const tx = manager.getRepository(InventoryTransaction).create({
                itemId: item.id,
                quantityDelta: delta,
                stockAfter: newQty,
                reason: TransactionReason.ADJUSTMENT,
                notes: null,
                loggedBy: loggedBy ?? null,
            });
            await manager.save(InventoryTransaction, tx);

            return item;
        });
    }

    async setPriceById(id: number, price: number): Promise<InventoryItem> {
        const item = await this.itemRepo.findOne({ where: { id } });
        if (!item) throw new NotFoundException(`Inventory item not found: ${id}`);
        item.unitPrice = price;
        return this.itemRepo.save(item);
    }

    async setNameById(id: number, name: string): Promise<InventoryItem> {
        const item = await this.itemRepo.findOne({ where: { id } });
        if (!item) throw new NotFoundException(`Inventory item not found: ${id}`);

        const existing = await this.itemRepo.findOne({ where: { name } });
        if (existing && existing.id !== id) throw new ConflictException('ITEM_ALREADY_EXISTS');

        item.name = name;
        return this.itemRepo.save(item);
    }

    // ─── Stock mutations used by other services ───────────────────────────────

    async deductStockById(
        itemId: number,
        quantity: number,
        manager: EntityManager,
        notes?: string,
        loggedBy?: string,
    ): Promise<void> {
        await this.applyAdjustments(
            [{ itemId, delta: -quantity }],
            TransactionReason.SALE,
            notes,
            loggedBy,
            manager,
        );
    }

    async restoreStockById(
        itemId: number,
        quantity: number,
        manager: EntityManager,
        notes?: string,
        loggedBy?: string,
    ): Promise<void> {
        await this.applyAdjustments(
            [{ itemId, delta: quantity }],
            TransactionReason.ADJUSTMENT,
            notes,
            loggedBy,
            manager,
        );
    }

    async syncDispatch(
        items: { itemId: number; quantity: number }[],
        notes?: string,
        loggedBy?: string,
        manager?: EntityManager,
    ): Promise<void> {
        const adjustments = items.map(({ itemId, quantity }) => ({ itemId, delta: -quantity }));
        await this.applyAdjustments(adjustments, TransactionReason.DISPATCH, notes, loggedBy, manager);
    }

    // ─── Logs ─────────────────────────────────────────────────────────────────

    async getTransactionLogs(): Promise<InventoryTransaction[]> {
        return this.txRepo.find({ order: { createdAt: 'DESC' } });
    }
}
