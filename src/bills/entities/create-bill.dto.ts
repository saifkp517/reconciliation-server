import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { type InventoryItemName } from '../../inventory/entities/inventory_items.entity';

export class CreateBillItemDto {
  @IsNotEmpty()
  name!: InventoryItemName;

  @IsString()
  @IsOptional()
  dimension?: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  // Salesman's entered price — if omitted, resolved from price list or inventory
  @IsNumber()
  @IsOptional()
  unit_sp?: number;
}

export class CreateBillDto {
  @IsInt()
  @IsNotEmpty()
  customer_id!: number;

  @IsDateString()
  bill_date!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBillItemDto)
  items!: CreateBillItemDto[];
}