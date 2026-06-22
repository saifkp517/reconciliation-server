import { IsInt, IsString, IsOptional, IsNumber, IsPositive, Min } from 'class-validator';

export class UpdateBlockStockDto {
  @IsString()
  dimension!: string;

  @IsInt()
  @Min(0)
  quantity!: number;
}


export class AddBlockStockDto {
  @IsString()
  dimension!: string;

  /** Amount to ADD to current stock (daily production increment) */
  @IsInt()
  @Min(1)
  amount!: number;

  @IsInt()
  @Min(1)
  cementBagsUsed!: number;
}

export class AddCementBagsDto {
  @IsInt()
  @Min(1)
  amount!: number;
}

export class CreateItemDto {
  @IsString()
  name!: string;

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