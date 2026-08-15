import { Module, Global } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Redis } from 'ioredis';
import { DDoSGuard } from './ddos.guard';
import { DDoSAdminController } from './ddos-admin.controller';

// ---------------------------------------------------------------------------
// Redis provider — shared across the DDoS module
// Reuses the same connection string as BullMQ (REDIS_URL)
// ---------------------------------------------------------------------------
const REDIS_TOKEN = 'DDOS_REDIS';

const RedisProvider = {
  provide: REDIS_TOKEN,
  useFactory: (): Redis => {
    const redis = new Redis(process.env.REDIS_URL ?? 'redis://redis:6379', {
      // Reconnect with exponential back-off, max 3s
      retryStrategy: (times) => Math.min(times * 200, 3000),
      maxRetriesPerRequest: null,
      lazyConnect: false,
      enableOfflineQueue: true,
    });
    redis.on('error', (err) =>
      console.error('[DDoSModule] Redis error:', err.message),
    );
    return redis;
  },
};

// ---------------------------------------------------------------------------
// DDoSGuardProvider — registers the guard application-wide via APP_GUARD
// ---------------------------------------------------------------------------
const DDoSGuardProvider = {
  provide: APP_GUARD,
  useFactory: (redis: Redis) => new DDoSGuard(redis),
  inject: [REDIS_TOKEN],
};

// ---------------------------------------------------------------------------
// DDoSModule
// Decorated as @Global so 'DDOS_REDIS' can be injected anywhere without
// re-importing this module.
// ---------------------------------------------------------------------------
@Global()
@Module({
  controllers: [DDoSAdminController],
  providers: [RedisProvider, DDoSGuardProvider],
  exports: [REDIS_TOKEN],
})
export class DDoSModule {}
