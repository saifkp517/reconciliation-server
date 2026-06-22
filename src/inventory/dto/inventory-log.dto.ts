// dto/inventory-log.dto.ts
import { Type } from 'class-transformer';
import {
  IsEnum, IsInt, IsNotEmpty, IsOptional,
  IsString, ValidateNested, ArrayMinSize, IsArray,
} from 'class-validator';
export class ChallanItemDto {
  @IsString()
  @IsNotEmpty()
  inventory_key!: string;

  @IsInt()
  @IsNotEmpty()
  delta!: number;
}

export class CreateDeliveryChallanDto {
  @IsEnum(['PRODUCTION', 'DELIVERY', 'PURCHASE', 'ADJUSTMENT'])
  transaction_type!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChallanItemDto)
  items!: ChallanItemDto[];
}