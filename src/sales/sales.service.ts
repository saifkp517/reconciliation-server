import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Sale } from '../database/entities/sale.entity';
import { SaleItem } from '../database/entities/sale-item.entity';
import { Customer } from '../database/entities/customer.entity';


export interface CreateSaleDto {
  customer_id: number;
  items: {
    dimension: string;
    quantity: number;
    unit_sp: number;
  }[]
}

const ITEM_CATALOG: Record<string, {
  zoho_item_id: string;
  unit_cp: number;
}> = {
  "4 inches": {
    zoho_item_id: "3644122000000051003",
    unit_cp: 28,
  },
  "6 inches": {
    zoho_item_id: "3644122000000051021",
    unit_cp: 32,
  },
  "8 inches": {
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

    const sale_date = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Kolkata',
    });



    return this.dataSource.transaction(async manager => {

      const today = new Date().toLocaleDateString('en-CA', {
        timeZone: 'Asia/Kolkata',
      }); // YYYY-MM-DD

      const countToday = await manager.count(Sale, {
        where: { sale_date: today },
      });

      const sequence = String(countToday + 1).padStart(3, '0');

      const invoice_no = `INV-${today.replace(/-/g, '')}-${sequence}`;
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
}