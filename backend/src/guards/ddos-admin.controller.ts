import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Headers,
  Inject,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { Redis } from 'ioredis';

// ---------------------------------------------------------------------------
// DDoSAdminController
//
// Provides endpoints for viewing rate-limit stats and managing IP bans.
// All endpoints require the 'x-admin-key' header to match ADMIN_API_KEY env.
//
// Endpoints:
//   GET    /api/admin/ddos/stats       — view current bans & violations
//   POST   /api/admin/ddos/ban/:ip     — manually ban an IP
//   DELETE /api/admin/ddos/ban/:ip     — unban an IP
// ---------------------------------------------------------------------------
@Controller('api/admin/ddos')
export class DDoSAdminController {
  constructor(@Inject('DDOS_REDIS') private readonly redis: Redis) {}

  // -------------------------------------------------------------------------
  // Auth helper
  // -------------------------------------------------------------------------
  private requireAdmin(token: string | undefined): void {
    const expected = process.env.ADMIN_API_KEY;
    if (!expected || token !== expected) {
      throw new UnauthorizedException('Invalid or missing admin API key');
    }
  }

  // -------------------------------------------------------------------------
  // GET /api/admin/ddos/stats
  // -------------------------------------------------------------------------
  @Get('stats')
  async getStats(@Headers('x-admin-key') token: string) {
    this.requireAdmin(token);

    const [banKeys, violKeys] = await Promise.all([
      this.redis.keys('ddos:ban:*'),
      this.redis.keys('ddos:viol:*'),
    ]);

    const bans = await Promise.all(
      banKeys.map(async (key) => {
        const ip = key.replace('ddos:ban:', '');
        const ttl = await this.redis.ttl(key);
        return { ip, expiresInSeconds: ttl };
      }),
    );

    const violations = await Promise.all(
      violKeys.map(async (key) => {
        const ip = key.replace('ddos:viol:', '');
        const count = await this.redis.get(key);
        return { ip, violationCount: parseInt(count ?? '0') };
      }),
    );

    return {
      timestamp: new Date().toISOString(),
      activeBans: bans.length,
      bans: bans.sort((a, b) => b.expiresInSeconds - a.expiresInSeconds),
      totalTrackedViolators: violations.length,
      violations: violations.sort((a, b) => b.violationCount - a.violationCount),
      config: {
        globalLimitPerMin: process.env.DDOS_GLOBAL_LIMIT ?? '200',
        apiLimitPerMin: process.env.DDOS_API_LIMIT ?? '60',
        authLimitPerMin: process.env.DDOS_AUTH_LIMIT ?? '10',
        banThreshold: process.env.DDOS_BAN_THRESHOLD ?? '5',
        banTtlSeconds: process.env.DDOS_BAN_TTL_SECONDS ?? '3600',
      },
    };
  }

  // -------------------------------------------------------------------------
  // POST /api/admin/ddos/ban/:ip   — manually ban an IP
  // -------------------------------------------------------------------------
  @Post('ban/:ip')
  async banIp(
    @Param('ip') ip: string,
    @Headers('x-admin-key') token: string,
  ) {
    this.requireAdmin(token);
    const banTtl = parseInt(process.env.DDOS_BAN_TTL_SECONDS ?? '3600');
    await this.redis.set(`ddos:ban:${ip}`, 'manual', 'EX', banTtl);
    return {
      message: `IP ${ip} manually banned for ${banTtl / 60} minutes.`,
      ip,
      expiresInSeconds: banTtl,
    };
  }

  // -------------------------------------------------------------------------
  // DELETE /api/admin/ddos/ban/:ip  — unban an IP
  // -------------------------------------------------------------------------
  @Delete('ban/:ip')
  async unbanIp(
    @Param('ip') ip: string,
    @Headers('x-admin-key') token: string,
  ) {
    this.requireAdmin(token);
    const deleted = await this.redis.del(`ddos:ban:${ip}`);
    if (!deleted) {
      throw new NotFoundException(`IP ${ip} is not currently banned.`);
    }
    // Also clear violation counter so the IP gets a fresh start
    await this.redis.del(`ddos:viol:${ip}`);
    return { message: `IP ${ip} unbanned successfully.`, ip };
  }
}
