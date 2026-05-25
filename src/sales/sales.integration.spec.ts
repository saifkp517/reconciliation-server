import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SalesService } from './sales.service';
import { InventoryService } from '../inventory/inventory.service';
import { TrucksService } from '../trucks/trucks.service';
import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { CustomerPriceList } from './entities/customer_pricelist.entity';
import { Customer } from './entities/customer.entity';

describe('SalesService (integration)', () => {
  let module: TestingModule;
  let service: SalesService;
  let dataSource: DataSource;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        // Point at your real local dev DB
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: 'localhost',
          port: 5432,
          username: 'postgres',
          password: 'yourpassword',
          database: 'yourdb',
          entities: [Sale, SaleItem, CustomerPriceList, Customer /* ...all entities */],
          synchronize: false, // never true against real DB
        }),
        TypeOrmModule.forFeature([Sale, SaleItem, CustomerPriceList, Customer]),
      ],
      providers: [SalesService, InventoryService, TrucksService],
    }).compile();

    service = module.get(SalesService);
    dataSource = module.get(DataSource);
  });

  afterAll(async () => {
    await module.close();
  });

  // ── Seed & cleanup helpers ─────────────────────────────────────────────

  async function seedCustomerWithPrices() {
    const customerRepo = dataSource.getRepository(Customer);
    const priceRepo = dataSource.getRepository(CustomerPriceList);

    const customer = await customerRepo.save(
      customerRepo.create({ name: 'Test Customer', phone: '0000000000' }),
    );

    await priceRepo.save([
      priceRepo.create({ customer_id: customer.id, itemName: 'BLOCK_4_INCHES', price: 999 }),
      priceRepo.create({ customer_id: customer.id, itemName: 'BLOCK_6_INCHES', price: 888 }),
    ]);

    return customer;
  }

  async function cleanupSale(saleId: number) {
    await dataSource.query(`DELETE FROM sale_items WHERE sale_id = $1`, [saleId]);
    await dataSource.query(`DELETE FROM sales WHERE id = $1`, [saleId]);
  }

  async function cleanupCustomer(customerId: number) {
    await dataSource.query(`DELETE FROM customer_price_list WHERE customer_id = $1`, [customerId]);
    await dataSource.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
  }

  // ── Tests ──────────────────────────────────────────────────────────────

  it('uses catalog rate when customer has no price list', async () => {
    const sale = await service.createSale({
      customer_id: null,
      sale_date: '2026-05-23',
      items: [{ dimension: 'BLOCK 4 inches', quantity: 10 }],
    });

    const item = sale.items[0];
    expect(item.unit_sp).toBe(29); // whatever catalog rate is
    expect(item.line_sp).toBe(290);

    await cleanupSale(sale.id);
  });

  it('uses customer price list when available', async () => {
    const customer = await seedCustomerWithPrices();

    const sale = await service.createSale({
      customer_id: customer.id,
      sale_date: '2026-05-23',
      items: [{ dimension: 'BLOCK 4 inches', quantity: 5 }],
    });

    const item = sale.items[0];
    expect(item.unit_sp).toBe(999);   // from price list
    expect(item.line_sp).toBe(4995);

    await cleanupSale(sale.id);
    await cleanupCustomer(customer.id);
  });

  it('falls back to catalog rate for items not in customer price list', async () => {
    const customer = await seedCustomerWithPrices(); // only has 4" and 6"

    const sale = await service.createSale({
      customer_id: customer.id,
      sale_date: '2026-05-23',
      items: [{ dimension: 'BLOCK 8 inches', quantity: 2 }],
    });

    const item = sale.items[0];
    expect(item.unit_sp).toBe(/* catalog rate for 8" */ 36);

    await cleanupSale(sale.id);
    await cleanupCustomer(customer.id);
  });
});