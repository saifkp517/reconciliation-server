// dto/inventory-log.dto.ts
import { Type } from 'class-transformer';
import {
  IsEnum, IsInt, IsNotEmpty, IsOptional,
  IsString, ValidateNested, ArrayMinSize, IsArray,
} from 'class-validator';
import { type TransactionType } from './inventory.dto';
import { type InventoryKey } from './inventory.dto';


export class ChallanItemDto {
  @IsString()
  @IsNotEmpty()
  inventory_key!: InventoryKey;

  @IsInt()
  @IsNotEmpty()
  delta!: number;
}

export class CreateDeliveryChallanDto {
  @IsEnum(['PRODUCTION', 'DELIVERY', 'PURCHASE', 'ADJUSTMENT'])
  transaction_type!: TransactionType;

  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChallanItemDto)
  items!: ChallanItemDto[];
}