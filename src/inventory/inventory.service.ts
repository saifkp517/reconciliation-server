import { Injectable } from '@nestjs/common';
import { InventoryStoreService } from './inventory_store.service';
import { EntityManager } from 'typeorm';

@Injectable()
export class InventoryService {
  constructor(private readonly store: InventoryStoreService) {}

  getAllItems(type?: 'raw_material' | 'product') {
    return this.store.getAllItems(type);
  }

  getItem(id: number) {
    return this.store.getItemById(id);
  }

  createItem(name: string, type: 'raw_material' | 'product', unit?: string, price?: number) {
    return this.store.createItem(name, type, unit, price);
  }

  deleteItem(id: number) {
    return this.store.deleteItem(id);
  }

  setQuantity(id: number, quantity: number, loggedBy?: string) {
    return this.store.setQuantityById(id, quantity, loggedBy);
  }

  setPrice(id: number, price: number) {
    return this.store.setPriceById(id, price);
  }

  setName(id: number, name: string) {
    return this.store.setNameById(id, name);
  }

  getTransactionLogs() {
    return this.store.getTransactionLogs();
  }

  deductStock(itemId: number, quantity: number, manager: EntityManager, notes?: string, loggedBy?: string) {
    return this.store.deductStockById(itemId, quantity, manager, notes, loggedBy);
  }

  addStock(itemId: number, quantity: number, manager: EntityManager, notes?: string, loggedBy?: string) {
    return this.store.restoreStockById(itemId, quantity, manager, notes, loggedBy);
  }

  validateAndDeductStock(
    items: { itemId: number; quantity: number }[],
    notes?: string,
    loggedBy?: string,
    manager?: EntityManager,
  ) {
    return this.store.syncDispatch(items, notes, loggedBy, manager);
  }
}
