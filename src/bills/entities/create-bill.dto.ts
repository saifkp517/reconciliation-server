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
export class CreateBillItemDto {
  @IsInt()
  @IsNotEmpty()
  @Min(1)
  itemId!: number;

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

  @IsString()
  @IsOptional()
  billing_address?: string;

  @IsString()
  @IsOptional()
  billing_city?: string;

  @IsString()
  @IsOptional()
  billing_state?: string;

  @IsString()
  @IsOptional()
  billing_pincode?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBillItemDto)
  items!: CreateBillItemDto[];
}