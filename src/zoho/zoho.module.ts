import { Module } from '@nestjs/common';
import { ZohoService } from './zoho.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [ZohoService],
  exports: [ZohoService],
})
export class ZohoModule {}