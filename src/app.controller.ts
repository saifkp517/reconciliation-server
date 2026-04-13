import { Controller, Get } from '@nestjs/common';
import { Query } from '@nestjs/common';
import { AuthService } from './auth/auth.service';
import { ZohoService } from './zoho/zoho.service';

@Controller()
export class AppController {
  constructor(
    private readonly authService: AuthService,
    private readonly zohoService: ZohoService,
  ) { }
  
  @Get('test-auth')
  async testAuth() {
    const token = await this.authService.getValidAccessToken();
    return {
      success: true,
      token: token.substring(0, 20) + '...', // don't expose full token
    };
  }

  @Get('test-zoho')
  async testZoho(@Query('from') from: string, @Query('to') to: string) {
    const orders = await this.zohoService.listSalesOrders(from, to);
    return {
      count: orders.length,
      sample: orders.slice(0, 2), // just show first 2
    };
  }
}
