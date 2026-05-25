import { IsInt, IsString, IsIn, Min } from 'class-validator';

export const VALID_DIMENSIONS = [
  'BLOCK 4 inches',
  'BLOCK 6 inches',
  'BLOCK 8 inches',
] as const;

export type BlockDimension = (typeof VALID_DIMENSIONS)[number];
export type InventoryKey = BlockDimension | 'CEMENT_BAGS';
export type TransactionType = 'PRODUCTION' | 'DELIVERY' | 'PURCHASE' | 'ADJUSTMENT';

export class UpdateBlockStockDto {
  /**
   * The dimension key to update.
   * Must be one of the valid block dimensions.
   */
  @IsString()
  @IsIn(VALID_DIMENSIONS)
  dimension!: string;

  /**
   * New absolute quantity to set (overwrites current stock).
   * Use this for daily "factory produced X blocks today" top-ups.
   */
  @IsInt()
  @Min(0)
  quantity!: number;
}


export class AddBlockStockDto {
  @IsString()
  @IsIn(VALID_DIMENSIONS)
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