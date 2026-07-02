import { IsInt, IsString, IsOptional, IsNumber, IsPositive, Min, IsIn } from 'class-validator';

export class CreateItemDto {
  @IsString()
  name!: string;

  @IsIn(['raw_material', 'product'])
  type!: 'raw_material' | 'product';

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  price?: number;
}

export class SetQuantityDto {
  @IsInt()
  @Min(0)
  quantity!: number;
}

export class SetPriceDto {
  @IsNumber()
  @IsPositive()
  price!: number;
}

export class SetNameDto {
  @IsString()
  name!: string;
}

export class AdjustStockDto {
  @IsInt()
  delta!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
