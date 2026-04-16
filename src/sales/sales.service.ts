import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Sale } from '../database/entities/sale.entity';
import { SaleItem } from '../database/entities/sale-item.entity';
import { Customer } from '../database/entities/customer.entity';


export interface CreateSaleDto {
  customer_id: number;
  sale_date: string; // YYYY-MM-DD (recommended)
  items: {
    dimension: string;
    quantity: number;
    unit_sp: number;
  }[];
}

const ITEM_CATALOG: Record<string, {
  zoho_item_id: string;
  unit_cp: number;
}> = {
  "BLOCK 4 inches": {
    zoho_item_id: "3644122000000051003",
    unit_cp: 28,
  },
  "BLOCK 6 inches": {
    zoho_item_id: "3644122000000051021",
    unit_cp: 32,
  },
  "BLOCK 8 inches": {
    zoho_item_id: "3644122000000051039",
    unit_cp: 36,
  },
};

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    @InjectRepository(Sale)
    private saleRepository: Repository<Sale>,
    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,
    @InjectRepository(SaleItem)
    private saleItemRepository: Repository<SaleItem>,
    private dataSource: DataSource,
  ) { }

  async getCustomers() {
    return this.customerRepository.find();
  }

  async createSale(dto: CreateSaleDto): Promise<Sale | null> {

    return this.dataSource.transaction(async manager => {

      const sale_date = dto.sale_date;

      const countToday = await manager.count(Sale, {
        where: { sale_date },
      });

      const sequence = String(countToday + 1).padStart(3, '0');

      const invoice_no = `INV-${sale_date.replace(/-/g, '')}-${sequence}`;
      // step 1 — create sale header
      const sale = manager.create(Sale, {
        customer_id: dto.customer_id,
        sale_date,
        invoice_no
      });
      const savedSale = await manager.save(Sale, sale);

      // step 2 — create sale items
      const saleItems = dto.items.map(item => {
        const catalogItem = ITEM_CATALOG[item.dimension];

        if (!catalogItem) {
          throw new Error(`Invalid item dimension: ${item.dimension}`);
        }

        return manager.create(SaleItem, {
          sale_id: savedSale.id,
          dimension: item.dimension,
          quantity: item.quantity,
          unit_sp: item.unit_sp,

          // derived values
          unit_cp: catalogItem.unit_cp,
          zoho_item_id: catalogItem.zoho_item_id,
          name: item.dimension,

          // computed
          line_sp: item.unit_sp * item.quantity,
          line_cp: catalogItem.unit_cp * item.quantity,
        });
      });
      await manager.save(SaleItem, saleItems);

      // step 3 — compute and update totals
      const total_sp = saleItems.reduce((sum, i) => sum + i.unit_sp * i.quantity, 0);
      const total_cp = saleItems.reduce((sum, i) => sum + i.unit_cp * i.quantity, 0);
      const profit = total_sp - total_cp;
      const profit_pct = total_sp > 0
        ? Math.round((profit / total_sp) * 100 * 100) / 100
        : 0;

      await manager.update(Sale, savedSale.id, { total_sp, total_cp, profit, profit_pct });

      return manager.findOne(Sale, {
        where: { id: savedSale.id },
        relations: ['items', 'customer'],
      });
    });
  }

  async getAllSales(): Promise<Sale[]> {
    return this.saleRepository.find({
      relations: ['items', 'customer'],
      order: { sale_date: 'DESC', id: 'DESC' },
    });
  }

  async updateSale(id: number, dto: Partial<CreateSaleDto>): Promise<Sale | null> {
    return this.dataSource.transaction(async manager => {

      const sale = await manager.findOne(Sale, {
        where: { id },
        relations: ['items'],
      });

      if (!sale) throw new Error(`Sale with id ${id} not found`);

      // Update header fields if provided
      if (dto.customer_id) await manager.update(Sale, id, { customer_id: dto.customer_id });
      if (dto.sale_date) await manager.update(Sale, id, { sale_date: dto.sale_date });

      // Replace items if provided
      if (dto.items) {
        await manager.delete(SaleItem, { sale_id: id });

        const newItems = dto.items.map(item => {
          const catalogItem = ITEM_CATALOG[item.dimension];
          if (!catalogItem) throw new Error(`Invalid item dimension: ${item.dimension}`);

          return manager.create(SaleItem, {
            sale_id: id,
            dimension: item.dimension,
            quantity: item.quantity,
            unit_sp: item.unit_sp,
            unit_cp: catalogItem.unit_cp,
            zoho_item_id: catalogItem.zoho_item_id,
            name: item.dimension,
            line_sp: item.unit_sp * item.quantity,
            line_cp: catalogItem.unit_cp * item.quantity,
          });
        });

        await manager.save(SaleItem, newItems);

        // Recompute sale-level aggregates
        const total_sp = newItems.reduce((sum, i) => sum + i.unit_sp * i.quantity, 0);
        const total_cp = newItems.reduce((sum, i) => sum + i.unit_cp * i.quantity, 0);
        const profit = total_sp - total_cp;
        const profit_pct = total_sp > 0
          ? Math.round((profit / total_sp) * 100 * 100) / 100
          : 0;

        await manager.update(Sale, id, { total_sp, total_cp, profit, profit_pct });
      }

      return manager.findOne(Sale, {
        where: { id },
        relations: ['items', 'customer'],
      });
    });
  }
}