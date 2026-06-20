import { Injectable, Logger } from '@nestjs/common';
import { AddBlockStockDto } from './dto/inventory.dto';
import { InventoryStoreService } from './inventory_store.service';
import {type InventoryItemName } from './entities/inventory_items.entity';
import { EntityManager } from 'typeorm';


@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(private readonly store: InventoryStoreService) {}

  // ─── READ ─────────────────────────────────────────────────────────────────

  async getStock(name: InventoryItemName) {
    return this.store.getItem(name);
  }

  async getAllStock() {
    return this.store.getAllItems();
  }

  async getProductionLogs() {
    return this.store.getProdutionLogs();
  }

  // ─── WRITE ────────────────────────────────────────────────────────────────

  async manufactureBlocks(dto: AddBlockStockDto, loggedBy?: string): Promise<void> {
    await this.store.syncManufacture(dto.dimension, dto.amount, dto.cementBagsUsed, loggedBy);
  }

  async createItem(name: string, unit?: string, price?: number) {
    return this.store.createItem(name, unit, price);
  }

  async setQuantity(id: number, quantity: number, loggedBy?: string) {
    return this.store.setQuantityById(id, quantity, loggedBy);
  }

  async setPrice(id: number, price: number) {
    return this.store.setPriceById(id, price);
  }

  async addCementStock(amount: number): Promise<void> {
    await this.store.syncCementPurchase(amount, 'manager');
  }

  async validateAndDeductStock(
    items: { dimension: string; quantity: number }[],
    notes?: string,
    loggedBy?: string,
    manager?: EntityManager,
  ): Promise<void> {
    await this.store.syncDispatch(items, notes, loggedBy, manager);
  }
}