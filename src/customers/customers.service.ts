import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString, IsOptional, Min, ValidateNested, IsArray } from 'class-validator';
import { Customer } from './entities/customer.entity';
import { CustomerPriceList } from './entities/customer_pricelist.entity';

export class CreatePriceListDto {
  @IsString()
  @IsNotEmpty()
  itemName!: string;

  @IsNumber()
  @Min(0)
  price!: number;
}

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  mobile?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  company_name?: string;

  @IsString()
  @IsOptional()
  customer_type?: string;

  @IsString()
  @IsOptional()
  gst_treatment?: string;

  @IsString()
  @IsOptional()
  gstin?: string;

  @IsString()
  @IsOptional()
  pan?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  shipping_address?: string;

  @IsNumber()
  @IsOptional()
  billing_lat?: number;

  @IsNumber()
  @IsOptional()
  billing_lng?: number;

  @IsNumber()
  @IsOptional()
  shipping_lat?: number;

  @IsNumber()
  @IsOptional()
  shipping_lng?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreatePriceListDto)
  priceLists?: CreatePriceListDto[];
}

export class UpdateCustomerDto {
  name?: string;
  phone?: string;
  address?: string;
  prices?: Record<string, number>;
}

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(CustomerPriceList)
    private readonly priceListRepo: Repository<CustomerPriceList>,
  ) {}

  async getCustomers(): Promise<Customer[]> {
    return this.customerRepo.find({
      relations: { priceLists: true },
      order: { name: 'ASC' },
    });
  }

  async getCustomer(id: number): Promise<Customer | null> {
    return this.customerRepo.findOne({
      relations: { watchmanLogs: true, priceLists: true },
      where: { id },
    });
  }

  async createCustomer(data: CreateCustomerDto): Promise<Customer | null> {
    const { priceLists, ...customerFields } = data;

    if (customerFields.phone && customerFields.phone.trim()) {
      const existing = await this.customerRepo.findOne({ where: { phone: customerFields.phone } });
      if (existing) {
        throw new BadRequestException(`A customer with phone ${customerFields.phone} already exists.`);
      }
    }

    const customer = await this.customerRepo.save(
      this.customerRepo.create(customerFields),
    );

    if (priceLists?.length) {
      const priceEntities = priceLists.map(entry =>
        this.priceListRepo.create({ customer, itemName: entry.itemName, price: entry.price }),
      );
      await this.priceListRepo.save(priceEntities);
    }

    return this.customerRepo.findOne({
      where: { id: customer.id },
      relations: ['priceLists'],
    });
  }

  async updateCustomer(id: number, dto: UpdateCustomerDto): Promise<Customer> {
    const { prices, ...customerFields } = dto;

    if (Object.keys(customerFields).length > 0) {
      await this.customerRepo.update(id, customerFields);
    }

    if (prices) {
      await Promise.all(
        Object.entries(prices).map(([itemName, price]) =>
          this.priceListRepo.upsert(
            { customer: { id }, itemName, price },
            ['customer', 'itemName'],
          ),
        ),
      );
    }

    return this.customerRepo.findOneOrFail({
      where: { id },
      relations: { priceLists: true },
    });
  }
}
