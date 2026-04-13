import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface TokenData {
  accessToken: string;
  expiresAt: number; // unix timestamp in ms
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private tokenData: TokenData | null = null;

  constructor(private configService: ConfigService) {}

  async getValidAccessToken(): Promise<string> {
    // if we have a token and it's not expired (with 60s buffer), return it
    if (this.tokenData && Date.now() < this.tokenData.expiresAt - 60_000) {
      this.logger.log('♻️  Using cached access token');
      return this.tokenData.accessToken;
    }

    this.logger.log('🔄 Access token expired or missing, refreshing...');
    return this.refreshAccessToken();
  }

  private async refreshAccessToken(): Promise<string> {
    const clientId = this.configService.get<string>('ZOHO_CLIENT_ID');
    const clientSecret = this.configService.get<string>('ZOHO_CLIENT_SECRET');
    const refreshToken = this.configService.get<string>('ZOHO_REFRESH_TOKEN');

    try {
      const response = await axios.post(
        'https://accounts.zoho.in/oauth/v2/token',
        null,
        {
          params: {
            grant_type: 'refresh_token',
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
          },
        },
      );

      const { access_token, expires_in } = response.data;

      this.tokenData = {
        accessToken: access_token,
        expiresAt: Date.now() + expires_in * 1000, // expires_in is in seconds
      };

      this.logger.log('✅ Access token refreshed successfully');
      return this.tokenData.accessToken;

    } catch (err) {
      this.logger.error('❌ Failed to refresh Zoho access token', err);
      throw new Error('Failed to refresh Zoho access token');
    }
  }
}