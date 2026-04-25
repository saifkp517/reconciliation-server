import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import type { Redis as RedisType } from 'ioredis';

export interface CachedEntry<T> {
    data: T;
    cachedAt: number; // Unix ms
}

export const FETCH_CONCURRENCY = 5; // p-limit cap


@Injectable()
export class CacheService implements OnModuleDestroy {
    private readonly logger = new Logger(CacheService.name);
    readonly client: RedisType;

    constructor() {
        this.client = new Redis({
            host: process.env.REDIS_HOST ?? 'localhost',
            port: Number(process.env.REDIS_PORT ?? 6379),
        });

        this.client.on('error', (err) => this.logger.error('Redis error', err));
    }

    async get<T>(key: string): Promise<T | null> {
        const raw = await this.client.get(key);
        return raw ? (JSON.parse(raw) as T) : null;
    }

    async set(key: string, value: unknown): Promise<void> {
        await this.client.set(key, JSON.stringify(value));
    }

    onModuleDestroy() {
        this.client.disconnect();
    }
}