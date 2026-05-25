import { Controller, Post, Get, Delete, Body, Param } from '@nestjs/common'
import { UsersService } from './auth.service';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post('login')
  login(@Body() body: { username: string; password: string }) {
    return this.usersService.login(body.username, body.password)
  }

  @Post('create')
  createUser(@Body() body: { username: string; password: string; role: string }) {
    return this.usersService.createUser(body.username, body.password, body.role)
  }

  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string, @Body() body: { newPassword: string }) {
    return this.usersService.resetPassword(id, body.newPassword)
  }

  @Get()
  listUsers() {
    return this.usersService.listUsers()
  }

  @Delete(':id')
  deleteUser(@Param('id') id: string) {
    return this.usersService.deleteUser(id)
  }
}