import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Bill } from './entities/bill.entity';
import { BillItem } from './entities/bill-item.entity';
import { CustomerPriceList } from '../watchmanlogs/entities/customer_pricelist.entity';
import { InventoryItem, InventoryItemName } from '../inventory/entities/inventory_items.entity';
import { CreateBillDto } from './entities/create-bill.dto';

@Injectable()
export class BillsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) { }

  private toInventoryItemName(raw: string): InventoryItemName {
    const normalized = raw
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_')
      .replace(/[^A-Z0-9_]/g, '');

    if (Object.values(InventoryItemName).includes(normalized as InventoryItemName)) {
      return normalized as InventoryItemName;
    }

    throw new Error(`Cannot map "${raw}" to a valid InventoryItemName enum value`);
  }

  async createBill(dto: CreateBillDto): Promise<Bill | null> {
    return this.dataSource.transaction(async manager => {
      const { customer_id, bill_date, items } = dto;

      // ── Fetch customer price list (keyed by itemName enum) ───────────────
      const existingPrices = await manager.find(CustomerPriceList, {
        where: { customer: { id: customer_id } },
      });

      const priceMap = new Map<InventoryItemName, CustomerPriceList>();
      for (const entry of existingPrices) {
        priceMap.set(entry.itemName, entry);
      }

      // ── Resolve prices + build bill items ────────────────────────────────
      const billItems: Partial<BillItem>[] = [];

      for (const item of items) {
        const itemName = this.toInventoryItemName(item.name)
        const existingEntry = priceMap.get(itemName)
        let resolvedPrice: number;

        if (item.unit_sp !== undefined) {
          // Salesman entered a price — this is the source of truth
          resolvedPrice = item.unit_sp;

          if (!existingEntry) {
            // No price list entry yet — insert one
            await manager.save(
              CustomerPriceList,
              manager.create(CustomerPriceList, {
                customer: { id: customer_id },
                itemName: item.name,
                price: resolvedPrice,
              }),
            );
          } else if (Number(existingEntry.price) !== resolvedPrice) {
            // Entry exists but price changed — update it
            existingEntry.price = resolvedPrice;
            await manager.save(CustomerPriceList, existingEntry);
          }
          // If price matches exactly — no write needed
        } else {
          // Salesman didn't enter a price — resolve from price list or inventory
          if (existingEntry) {
            resolvedPrice = Number(existingEntry.price);
          } else {
            // Fall back to inventory unit_price
            const inventoryItem = await manager.findOne(InventoryItem, {
              where: { name: item.name },
            });

            if (!inventoryItem) {
              throw new NotFoundException(
                `No price found for item "${item.name}" — add it to the inventory or enter a price manually.`,
              );
            }

            resolvedPrice = Number(inventoryItem.unitPrice);

            // Insert into price list so future bills autopopulate
            await manager.save(
              CustomerPriceList,
              manager.create(CustomerPriceList, {
                customer: { id: customer_id },
                itemName: item.name,
                price: resolvedPrice,
              }),
            );
          }
        }

        billItems.push({
          name: item.name,
          dimension: item.dimension,
          quantity: item.quantity,
          unit_sp: resolvedPrice,
          line_sp: resolvedPrice * item.quantity,
        });
      }

      // ── Save bill header ─────────────────────────────────────────────────
      const savedBill = await manager.save(
        Bill,
        manager.create(Bill, { customer_id, bill_date }),
      );

      // ── Save bill items ──────────────────────────────────────────────────
      await manager.save(
        BillItem,
        billItems.map(item =>
          manager.create(BillItem, { ...item, bill_id: savedBill.id }),
        ),
      );

      // ── Return full bill with relations ──────────────────────────────────
      return manager.findOne(Bill, {
        where: { id: savedBill.id },
        relations: ['items', 'customer'],
      });
    });
  }

  async findAll(): Promise<Bill[]> {
    return this.dataSource.getRepository(Bill).find({
      relations: ['items', 'customer'],
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Bill> {
    const bill = await this.dataSource.getRepository(Bill).findOne({
      where: { id },
      relations: ['items', 'customer'],
    });

    if (!bill) throw new NotFoundException(`Bill #${id} not found`);

    return bill;
  }

  async getPriceListByCustomer(customerId: number): Promise<CustomerPriceList[]> {
    return this.dataSource.getRepository(CustomerPriceList).find({
      where: { customer: { id: customerId } },
    });
  }
}