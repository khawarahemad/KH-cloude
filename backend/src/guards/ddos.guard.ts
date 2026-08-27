import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import axios from 'axios';

// ---------------------------------------------------------------------------
// Configuration — all overridable via environment variables
// ---------------------------------------------------------------------------
const CFG = {
  // Max requests per minute per IP per tier
  limits: {
    auth: () => parseInt(process.env.DDOS_AUTH_LIMIT ?? '10'),
    api: () => parseInt(process.env.DDOS_API_LIMIT ?? '60'),
    global: () => parseInt(process.env.DDOS_GLOBAL_LIMIT ?? '200'),
  },
  // How many limit-violations before an IP gets auto-banned
  banThreshold: () => parseInt(process.env.DDOS_BAN_THRESHOLD ?? '5'),
  // How long the ban lasts (seconds)
  banTtl: () => parseInt(process.env.DDOS_BAN_TTL_SECONDS ?? '3600'),
  // Sliding window size (seconds) — 60 = per-minute
  windowSeconds: 60,
};

// ---------------------------------------------------------------------------
// Trusted IP prefixes — never rate-limited (internal Docker/loopback traffic)
// ---------------------------------------------------------------------------
const TRUSTED_EXACT = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function isTrusted(ip: string): boolean {
  if (TRUSTED_EXACT.has(ip)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Extract the real client IP, relying on Express 'trust proxy'
// ---------------------------------------------------------------------------
function getClientIp(req: any): string {
  // Express 'trust proxy' handles X-Forwarded-For securely
  return req.ip ?? req.socket?.remoteAddress ?? '0.0.0.0';
}

// ---------------------------------------------------------------------------
// Map a URL to a rate-limit tier
// ---------------------------------------------------------------------------
type Tier = 'auth' | 'api' | 'global';

function getTier(url: string): Tier {
  if (/\/api\/auth\//i.test(url)) return 'auth';
  if (url.startsWith('/api/')) return 'api';
  return 'global';
}

// ---------------------------------------------------------------------------
// DDoSGuard
// ---------------------------------------------------------------------------
@Injectable()
export class DDoSGuard implements CanActivate {
  private readonly logger = new Logger(DDoSGuard.name);

  constructor(private readonly redis: Redis) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<any>();
    const ip = getClientIp(req);

    // 1. Trusted / internal IPs are always allowed
    if (isTrusted(ip)) return true;

    // 2. Check active ban
    const banKey = `ddos:ban:${ip}`;
    const banned = await this.redis.get(banKey);
    if (banned) {
      const retryAfter = await this.redis.ttl(banKey);
      this.throwRateLimit(
        `Your IP has been temporarily banned due to excessive requests. Retry after ${retryAfter}s.`,
        retryAfter,
      );
    }

    // 3. Sliding-window counter
    const tier = getTier(req.url as string);
    const limit = CFG.limits[tier]();
    const windowSlot = Math.floor(Date.now() / 1000 / CFG.windowSeconds);
    const counterKey = `ddos:req:${ip}:${windowSlot}`;

    const [, count] = (await this.redis
      .pipeline()
      .incr(counterKey)
      .expire(counterKey, CFG.windowSeconds * 2)
      .exec()) ?? [null, [null, 0]];

    const reqCount = (count as [Error | null, number])[1] ?? 0;

    if (reqCount > limit) {
      // 4. Track violations (reset on ban expiry)
      const violKey = `ddos:viol:${ip}`;
      const violations = await this.redis.incr(violKey);
      await this.redis.expire(violKey, CFG.banTtl());

      if (violations >= CFG.banThreshold()) {
        // 5. Auto-ban
        await this.redis.set(banKey, '1', 'EX', CFG.banTtl());
        this.logger.warn(
          `🚫 Auto-banned ${ip} | tier=${tier} | violations=${violations}`,
        );
        void this.sendBanAlert(ip, tier, violations);
      }

      const retryAfter =
        CFG.windowSeconds - (Math.floor(Date.now() / 1000) % CFG.windowSeconds);
      this.throwRateLimit(
        `Rate limit exceeded (${limit} req/min for "${tier}" tier). Retry after ${retryAfter}s.`,
        retryAfter,
      );
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  private throwRateLimit(message: string, retryAfter: number): never {
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message,
        retryAfter,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private async sendBanAlert(
    ip: string,
    tier: Tier,
    violations: number,
  ): Promise<void> {
    const webhookUrl = process.env.DDOS_ALERT_DISCORD_WEBHOOK;
    if (!webhookUrl) return;

    try {
      await axios.post(webhookUrl, {
        embeds: [
          {
            title: '🚫 DDoS Auto-Ban Triggered',
            color: 0xff0000,
            description: `An IP address has been **automatically banned** for exceeding rate limits repeatedly.`,
            fields: [
              { name: '🌐 IP Address', value: `\`${ip}\``, inline: true },
              { name: '📊 Tier Exceeded', value: tier.toUpperCase(), inline: true },
              { name: '⚠️ Violations', value: String(violations), inline: true },
              {
                name: '⏱️ Ban Duration',
                value: `${CFG.banTtl() / 60} minutes`,
                inline: true,
              },
              {
                name: '🛡️ Rate Limits',
                value: [
                  `• Auth: **${CFG.limits.auth()} req/min**`,
                  `• API: **${CFG.limits.api()} req/min**`,
                  `• Global: **${CFG.limits.global()} req/min**`,
                ].join('\n'),
                inline: false,
              },
            ],
            timestamp: new Date().toISOString(),
            footer: { text: '🛡️ KH Cloud DDoS Protection System' },
          },
        ],
      });
    } catch (err: any) {
      this.logger.error('Failed to send DDoS ban alert to Discord', err.message);
    }
  }
}
