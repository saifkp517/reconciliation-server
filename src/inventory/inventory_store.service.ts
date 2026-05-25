import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InventoryTransaction } from './entities/inventory_transactions.entity';
import { InventoryItem } from './entities/inventory_items.entity';
import { Expense } from './entities/expense.entity';
import { TransactionReason } from './entities/inventory_transactions.entity';
import { InventoryItemName } from './entities/inventory_items.entity';

// ─── Catalog helpers (mirrors old Zoho constants) ─────────────────────────────

export const DIMENSION_TO_ITEM_NAME: Record<string, InventoryItemName> = {
    'BLOCK 4 inches': InventoryItemName.BLOCK_4_INCHES,
    'BLOCK 6 inches': InventoryItemName.BLOCK_6_INCHES,
    'BLOCK 8 inches': InventoryItemName.BLOCK_8_INCHES,
};

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

    private async findItemByName(name: InventoryItemName): Promise<InventoryItem> {
        const item = await this.itemRepo.findOne({ where: { name } });
        if (!item) throw new NotFoundException(`Inventory item not found: ${name}`);
        return item;
    }

    private dimensionToItemName(dimension: string): InventoryItemName {
        const name = DIMENSION_TO_ITEM_NAME[dimension];
        if (!name) throw new BadRequestException(`Unknown block dimension: ${dimension}`);
        return name;
    }

    /**
     * Core stock mutation — always runs inside a serializable transaction so
     * concurrent requests can't produce a negative stock race condition.
     */
    private async applyAdjustments(
        adjustments: { itemName: InventoryItemName; delta: number }[],
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
                        `Insufficient stock for ${item.label}. ` +
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
                    `📦 ${reason} | ${item.label} | delta: ${delta > 0 ? '+' : ''}${delta} | stock now: ${newStock}`,
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
        const blockName = this.dimensionToItemName(dimension);

        await this.applyAdjustments(
            [
                { itemName: blockName, delta: +blocksAdded },
                { itemName: InventoryItemName.CEMENT_BAGS, delta: -cementUsed },
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
        const item = await this.findItemByName(InventoryItemName.CEMENT_BAGS);
        const unitPrice = Number(item.unitPrice);

        await this.applyAdjustments(
            [{ itemName: InventoryItemName.CEMENT_BAGS, delta: +amount }],
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
            itemName: this.dimensionToItemName(dimension),
            delta: -quantity,
        }));

        await this.applyAdjustments(adjustments, TransactionReason.DISPATCH, notes, loggedBy, manager);
    }

    // ─── Read methods ─────────────────────────────────────────────────────────

    async getItem(name: InventoryItemName): Promise<InventoryItem> {
        return this.findItemByName(name);
    }

    async getAllItems(): Promise<InventoryItem[]> {
        return this.itemRepo.find({ order: { name: 'ASC' } });
    }

    async getProdutionLogs() {
        return this.txRepo.find({
            order: { createdAt: 'ASC'},
        })
    }
}