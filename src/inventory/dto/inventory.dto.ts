import { IsInt, IsString, IsIn, Min } from 'class-validator';
import { VALID_DIMENSIONS } from '../entities/inventory.entity';

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