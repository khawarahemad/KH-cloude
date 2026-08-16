import { Module, Global } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { Redis } from 'ioredis';
import { DDoSGuard } from './ddos.guard';
import { DDoSAdminController } from './ddos-admin.controller';
import { NetworkService } from './network.service';
import { NetworkInterceptor } from './network.interceptor';
import { NetworkAdminController } from './network-admin.controller';

// ---------------------------------------------------------------------------
// Redis provider — shared across the DDoS & Network module
// ---------------------------------------------------------------------------
const REDIS_TOKEN = 'DDOS_REDIS';

const RedisProvider = {
  provide: REDIS_TOKEN,
  useFactory: (): Redis => {
    const redis = new Redis(process.env.REDIS_URL ?? 'redis://redis:6379', {
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

const DDoSGuardProvider = {
  provide: APP_GUARD,
  useFactory: (redis: Redis) => new DDoSGuard(redis),
  inject: [REDIS_TOKEN],
};

const NetworkInterceptorProvider = {
  provide: APP_INTERCEPTOR,
  useClass: NetworkInterceptor,
};

import { TraefikLogParserService } from './traefik-log-parser.service';

@Global()
@Module({
  controllers: [DDoSAdminController, NetworkAdminController],
  providers: [
    RedisProvider,
    DDoSGuardProvider,
    NetworkService,
    NetworkInterceptorProvider,
    TraefikLogParserService,
  ],
  exports: [REDIS_TOKEN, NetworkService],
})
export class DDoSModule {}
