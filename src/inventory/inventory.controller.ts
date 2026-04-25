import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import {
    AddBlockStockDto,
    AddCementBagsDto,
    UpdateBlockStockDto,
} from './dto/inventory.dto';
import { InventoryLog } from './entities/inventory-log.entity';
import { CreateInventoryLogDto } from './dto/inventory-log.dto';

@Controller('inventory')
export class InventoryController {
    constructor(private readonly inventoryService: InventoryService) { }

    // GET /inventory
    @Get()
    getAll() {
        return this.inventoryService.getAll();
    }

    // ── Logs ───────────────────────────────────────────────────────────────────
    // ⚠️ These must be above :key to avoid being swallowed by it

    // GET /inventory/logs
    @Get('logs')
    getLogs(): Promise<InventoryLog[]> {
        return this.inventoryService.getLogs();
    }


    // POST /inventory/logs
    @Post('logs')
    createLog(@Body() dto: CreateInventoryLogDto): Promise<InventoryLog> {
        return this.inventoryService.createLog(dto);
    }

    // ── Blocks ─────────────────────────────────────────────────────────────────

    // POST /inventory/blocks/add
    @Post('blocks/manufacture')
    addBlockStock(@Body() dto: AddBlockStockDto) {
        return this.inventoryService.manufactureBlocks(dto);
    }

    // ── Cement bags ────────────────────────────────────────────────────────────

    // POST /inventory/cement-bags/add
    @Post('cement-bags/add')
    addCementBags(@Body() dto: AddCementBagsDto) {
        return this.inventoryService.addCementBags(dto);
    }

    // ── Wildcard — must be last ────────────────────────────────────────────────

    // GET /inventory/:key
    @Get(':key')
    getOne(@Param('key') key: string) {
        return this.inventoryService.getByKey(key as any);
    }
}