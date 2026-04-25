// dto/inventory-log.dto.ts
import { Type } from 'class-transformer';
import {
  IsEnum, IsInt, IsNotEmpty, IsOptional,
  IsString, ValidateNested, ArrayMinSize, IsArray,
} from 'class-validator';
import type { TransactionType } from '../entities/inventory-log.entity';
import type { InventoryKey } from '../entities/inventory.entity';

export class LogItemDto {
  @IsString()
  @IsNotEmpty()
  inventory_key!: InventoryKey;

  @IsInt()
  @IsNotEmpty()
  delta!: number;
}

export class CreateInventoryLogDto {
  @IsEnum(['PRODUCTION', 'DELIVERY', 'PURCHASE', 'ADJUSTMENT'])
  transaction_type!: TransactionType;

  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LogItemDto)
  items!: LogItemDto[];
}