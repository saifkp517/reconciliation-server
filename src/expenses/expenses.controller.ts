import {
  Controller, Post, Get, Patch, Delete,
  Body, Param, ParseIntPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ExpensesService,
  CreateExpenseLogDto,
  SaveParsedItemDto,
  UpdateExpenseLogItemDto,
  CategorizeItemDto,
} from './expenses.service';

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  // ── Expense Logs ────────────────────────────────────────────────────────────

  @Post()
  create(@Body() body: CreateExpenseLogDto) {
    return this.service.create(body);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('mine/:username')
  getMine(@Param('username') username: string) {
    return this.service.findByUser(username);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.service.delete(id);
  }

  // ── Items ───────────────────────────────────────────────────────────────────

  @Post(':id/items')
  saveParsedItems(
    @Param('id', ParseIntPipe) id: number,
    @Body('items') items: SaveParsedItemDto[],
  ) {
    return this.service.saveParsedItems(id, items);
  }

  @Patch('items/:itemId')
  updateItem(
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() body: UpdateExpenseLogItemDto,
  ) {
    return this.service.updateItem(itemId, body);
  }

  @Delete('items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteItem(@Param('itemId', ParseIntPipe) itemId: number) {
    return this.service.deleteItem(itemId);
  }

  // ── Status transitions ──────────────────────────────────────────────────────

  @Post(':id/categorize')
  categorizeItems(
    @Param('id', ParseIntPipe) id: number,
    @Body('items') items: CategorizeItemDto[],
  ) {
    return this.service.categorizeItems(id, items);
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@Param('id', ParseIntPipe) id: number) {
    return this.service.confirm(id);
  }

  // ── AI stubs ─────────────────────────────────────────────────────────────────

  @Post(':id/parse')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  parse() {
    return { message: 'Not implemented — AI parsing coming soon.' };
  }

  @Post(':id/ai-categorize')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  aiCategorize() {
    return { message: 'Not implemented — AI categorization coming soon.' };
  }
}
