import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
    ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InventoryTransaction } from './entities/inventory_transactions.entity';
import { InventoryItem } from './entities/inventory_items.entity';
import { Expense } from './entities/expense.entity';
import { TransactionReason } from './entities/inventory_transactions.entity';
const CEMENT_ITEM_NAME = 'CEMENT BAGS';

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class InventoryStoreService {
    private readonly logger = new Logger(InventoryStoreService.name);

    constructor(
        @InjectRepository(InventoryItem)
        private readonly itemRepo: Repository<InventoryItem>,

        @InjectRepository(InventoryTransaction)
        private readonly txRepo: Repository<InventoryTransaction>,

        @InjectRepository(Expense)
        private readonly expenseRepo: Repository<Expense>,

        private readonly dataSource: DataSource,
    ) { }

    // ─── Internal helpers ────────────────────────────────────────────────────

    private async findItemByName(name: string): Promise<InventoryItem> {
        const item = await this.itemRepo.findOne({ where: { name } });
        if (!item) throw new NotFoundException(`Inventory item not found: ${name}`);
        return item;
    }

    /**
     * Core stock mutation — always runs inside a serializable transaction so
     * concurrent requests can't produce a negative stock race condition.
     */
    private async applyAdjustments(
        adjustments: { itemName: string; delta: number }[],
        reason: TransactionReason,
        notes?: string,
        loggedBy?: string,
        manager?: EntityManager,
    ): Promise<void> {
        const run = async (manager: EntityManager) => {
            for (const { itemName, delta } of adjustments) {
                const item = await manager
                    .getRepository(InventoryItem)
                    .createQueryBuilder('item')
                    .setLock('pessimistic_write')
                    .where('item.name = :name', { name: itemName })
                    .getOne();

                if (!item) throw new NotFoundException(`Inventory item not found: ${itemName}`);

                const newStock = Number(item.stock) + delta;

                if (newStock < 0) {
                    throw new BadRequestException(
                        `Insufficient stock for ${item.name}. ` +
                        `Available: ${item.stock}, requested: ${Math.abs(delta)}`,
                    );
                }

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

    // ─── Public API (mirrors ZohoInventoryService) ────────────────────────────

    /**
     * Record block manufacturing: adds finished blocks, deducts cement bags.
     */
    async syncManufacture(
        dimension: string,
        blocksAdded: number,
        cementUsed: number,
        loggedBy?: string,
    ): Promise<void> {
        await this.applyAdjustments(
            [
                { itemName: dimension, delta: +blocksAdded },
                { itemName: CEMENT_ITEM_NAME, delta: -cementUsed },
            ],
            TransactionReason.PRODUCTION,
            `Manufactured ${blocksAdded}x ${dimension}, used ${cementUsed} cement bags`,
            loggedBy,
        );
    }

    /**
     * Record a cement purchase: adds bags and logs an expense row.
     */
    async syncCementPurchase(amount: number, loggedBy?: string): Promise<void> {
        const item = await this.findItemByName(CEMENT_ITEM_NAME);
        const unitPrice = Number(item.unitPrice);

        await this.applyAdjustments(
            [{ itemName: CEMENT_ITEM_NAME, delta: +amount }],
            TransactionReason.PURCHASE,
            `Restock — ${amount} bags @ ₹${unitPrice} each`,
            loggedBy,
        );

        await this.expenseRepo.save(
            this.expenseRepo.create({
                loggedBy: loggedBy ?? 'factory_expense',
                description: `Cement restock — ${amount} bags @ ₹${unitPrice} each`,
                amount: unitPrice * amount,
            }),
        );
    }

    /**
     * Deduct dispatched blocks. Throws if any item is understocked.
     */
    async syncDispatch(
        items: { dimension: string; quantity: number }[],
        notes?: string,
        loggedBy?: string,
        manager?: EntityManager,
    ): Promise<void> {
        const adjustments = items.map(({ dimension, quantity }) => ({
            itemName: dimension,
            delta: -quantity,
        }));

        await this.applyAdjustments(adjustments, TransactionReason.DISPATCH, notes, loggedBy, manager);
    }

    // ─── Read methods ─────────────────────────────────────────────────────────

    async getItem(name: string): Promise<InventoryItem> {
        return this.findItemByName(name);
    }

    async getAllItems(): Promise<InventoryItem[]> {
        return this.itemRepo.find({ order: { name: 'ASC' } });
    }

    async createItem(name: string, unit?: string, price?: number): Promise<InventoryItem> {
        const existing = await this.itemRepo.findOne({ where: { name } });
        if (existing) throw new ConflictException('ITEM_ALREADY_EXISTS');

        const item = this.itemRepo.create({
            name,
            unit: unit ?? null,
            unitPrice: price ?? 0,
            stock: 0,
        });
        return this.itemRepo.save(item);
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

    async getProdutionLogs() {
        return this.txRepo.find({
            order: { createdAt: 'ASC'},
        })
    }
}