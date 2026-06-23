import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Bill, PaymentStatus } from './entities/bill.entity';
import { BillItem } from './entities/bill-item.entity';
import { CustomerPriceList } from '../watchmanlogs/entities/customer_pricelist.entity';
import { InventoryItem } from '../inventory/entities/inventory_items.entity';
import { Customer } from '../watchmanlogs/entities/customer.entity';
import { CreateBillDto } from './entities/create-bill.dto';
import { COMPANY_PREFIX, getFiscalYear, nextInvoiceSeq } from './invoice.util';

export class RecordPaymentDto {
  paid_amount!: number;
  payment_status!: PaymentStatus;
  payment_date!: string;
}

export class BulkUpdateBillDto {
  id!: number;
  paid_amount?: number;
  payment_status?: PaymentStatus;
  payment_date?: string;
}


@Injectable()
export class BillsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) { }

  async createBill(dto: CreateBillDto): Promise<Bill | null> {
    return this.dataSource.transaction(async manager => {
      const { customer_id, bill_date, items, billing_address, billing_city, billing_state, billing_pincode } = dto;

      const customer = await manager.findOne(Customer, { where: { id: customer_id } });
      if (!customer) throw new NotFoundException(`Customer #${customer_id} not found`);

      const existingPrices = await manager.find(CustomerPriceList, {
        where: { customer: { id: customer_id } },
      });

      const priceMap = new Map<string, CustomerPriceList>();
      for (const entry of existingPrices) {
        priceMap.set(entry.itemName, entry);
      }

      const billItems: Partial<BillItem>[] = [];

      for (const item of items) {
        const existingEntry = priceMap.get(item.name)
        let resolvedPrice: number;

        if (item.unit_sp !== undefined) {
          resolvedPrice = item.unit_sp;

          if (!existingEntry) {
            await manager.save(
              CustomerPriceList,
              manager.create(CustomerPriceList, {
                customer: { id: customer_id },
                itemName: item.name,
                price: resolvedPrice,
              }),
            );
          } else if (Number(existingEntry.price) !== resolvedPrice) {
            existingEntry.price = resolvedPrice;
            await manager.save(CustomerPriceList, existingEntry);
          }
        } else {
          if (existingEntry) {
            resolvedPrice = Number(existingEntry.price);
          } else {
            const inventoryItem = await manager.findOne(InventoryItem, {
              where: { name: item.name },
            });

            if (!inventoryItem) {
              throw new NotFoundException(
                `No price found for item "${item.name}" — add it to the inventory or enter a price manually.`,
              );
            }

            resolvedPrice = Number(inventoryItem.unitPrice);

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

      const due = new Date(bill_date);
      due.setDate(due.getDate() + 7);
      const due_date = due.toISOString().slice(0, 10);

      // ── Assign fiscal invoice number ─────────────────────────────────────
      const fiscalYear = getFiscalYear(bill_date);
      const fiscal_seq = await nextInvoiceSeq(manager, 'SL', fiscalYear);
      const invoice_no = `${COMPANY_PREFIX}/SL/${fiscalYear}/${fiscal_seq}`;

      const savedBill = await manager.save(
        Bill,
        manager.create(Bill, {
          customer_id,
          bill_date,
          due_date,
          fiscal_seq,
          invoice_no,
          billing_address: billing_address ?? customer.address ?? null,
          billing_city: billing_city ?? null,
          billing_state: billing_state ?? null,
          billing_pincode: billing_pincode ?? null,
        }),
      );

      await manager.save(
        BillItem,
        billItems.map(item =>
          manager.create(BillItem, { ...item, bill_id: savedBill.id }),
        ),
      );

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

  async recordPayment(id: number, dto: RecordPaymentDto): Promise<Bill> {
    const repo = this.dataSource.getRepository(Bill);
    const bill = await repo.findOne({ where: { id }, relations: ['items', 'customer'] });

    if (!bill) throw new NotFoundException(`Bill #${id} not found`);

    bill.paid_amount = dto.paid_amount;
    bill.payment_status = dto.payment_status;
    bill.payment_date = dto.payment_date;

    return repo.save(bill);
  }

  async bulkUpdate(updates: BulkUpdateBillDto[]): Promise<Bill[]> {
    const repo = this.dataSource.getRepository(Bill);

    const bills = await Promise.all(
      updates.map(async ({ id, ...fields }) => {
        const bill = await repo.findOne({ where: { id }, relations: ['items', 'customer'] });
        if (!bill) throw new NotFoundException(`Bill #${id} not found`);
        Object.assign(bill, fields);
        return repo.save(bill);
      }),
    );

    return bills;
  }

  async getPriceListByCustomer(customerId: number): Promise<CustomerPriceList[]> {
    return this.dataSource.getRepository(CustomerPriceList).find({
      where: { customer: { id: customerId } },
    });
  }

  async getCustomerOutstanding(customerId: number) {
    const repo = this.dataSource.getRepository(Bill);

    const bills = await repo.find({
      where: [
        { customer_id: customerId, payment_status: PaymentStatus.OUTSTANDING },
        { customer_id: customerId, payment_status: PaymentStatus.PARTIAL },
      ],
      relations: ['items'],
      order: { due_date: 'ASC' },
    });

    const summary = bills.map(bill => ({
      bill_id: bill.id,
      invoice_no: bill.invoice_no,
      bill_date: bill.bill_date,
      due_date: bill.due_date,
      payment_status: bill.payment_status,
      total_amount: bill.totalAmount,
      paid_amount: Number(bill.paid_amount),
      outstanding_amount: bill.totalAmount - Number(bill.paid_amount),
    }));

    const total_outstanding = summary.reduce((sum, b) => sum + b.outstanding_amount, 0);

    return { customer_id: customerId, total_outstanding, bills: summary };
  }
}
