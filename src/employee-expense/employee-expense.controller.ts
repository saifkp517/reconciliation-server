import { Controller, Post, Get, Patch, Body, Param } from '@nestjs/common'
import { EmployeeExpenseService } from './employee-expense.service'

@Controller('expenses')
export class EmployeeExpenseController {
  constructor(private readonly employeeExpenseService: EmployeeExpenseService) {}

  @Post()
  create(@Body() body: { username: string; description: string; amount: number; date?: string }) {
    return this.employeeExpenseService.create(body.username, body)
  }

  @Get('mine/:username')
  getMine(@Param('username') username: string) {
    return this.employeeExpenseService.findByUser(username)
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { username: string; description?: string; amount?: number; date?: string }
  ) {
    return this.employeeExpenseService.update(body.username, id, body)
  }
}