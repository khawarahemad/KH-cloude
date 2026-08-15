import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Headers,
  Inject,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { NetworkService } from './network.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('api/admin/network')
export class NetworkAdminController {
  constructor(
    @Inject('DDOS_REDIS') private readonly redis: Redis,
    private readonly networkService: NetworkService,
    private readonly prisma: PrismaService,
  ) {}

  private async requireAdmin(
    token?: string,
    adminUserId?: string,
  ): Promise<void> {
    // 1. Admin API key header check
    const expected = process.env.ADMIN_API_KEY;
    if (expected && token === expected) {
      return;
    }

    // 2. Query param adminUserId check
    if (adminUserId) {
      const user = await (this.prisma as any).user.findUnique({
        where: { id: adminUserId },
      });
      if (user && user.role === 'ADMIN') {
        return;
      }
    }

    throw new UnauthorizedException('Invalid or missing admin credentials');
  }

  // -------------------------------------------------------------------------
  // GET /api/admin/network/stats — Get 7-day traffic stats & top IPs
  // -------------------------------------------------------------------------
  @Get('stats')
  async getStats(
    @Headers('x-admin-key') token?: string,
    @Query('adminUserId') adminUserId?: string,
  ) {
    await this.requireAdmin(token, adminUserId);

    const stats = await this.networkService.getStats();

    // Enrich top IPs with active ban status from Redis
    const banKeys = await this.redis.keys('ddos:ban:*');
    const bannedIpsSet = new Set(banKeys.map((k) => k.replace('ddos:ban:', '')));

    const topIpsWithBans = await Promise.all(
      stats.topIps.map(async (ipData) => {
        const isBanned = bannedIpsSet.has(ipData.ip);
        let expiresInSeconds = 0;
        if (isBanned) {
          expiresInSeconds = await this.redis.ttl(`ddos:ban:${ipData.ip}`);
        }
        return {
          ...ipData,
          isBanned,
          banExpiresInSeconds: Math.max(0, expiresInSeconds),
        };
      }),
    );

    return {
      timestamp: new Date().toISOString(),
      overview: {
        ...stats.overview,
        activeBansCount: bannedIpsSet.size,
      },
      dailyTrends: stats.dailyTrends,
      statusDistribution: stats.statusDistribution,
      topIps: topIpsWithBans,
      recentLogs: stats.recentLogs,
    };
  }

  // -------------------------------------------------------------------------
  // POST /api/admin/network/clean — Trigger 7-day retention cleanup
  // -------------------------------------------------------------------------
  @Post('clean')
  async cleanOldLogs(
    @Headers('x-admin-key') token?: string,
    @Query('adminUserId') adminUserId?: string,
  ) {
    await this.requireAdmin(token, adminUserId);
    const result = await this.networkService.deleteOldLogs();
    return {
      message: `Successfully purged ${result.deletedCount} log records older than 7 days.`,
      deletedCount: result.deletedCount,
    };
  }

  // -------------------------------------------------------------------------
  // POST /api/admin/network/ban/:ip — Ban IP
  // -------------------------------------------------------------------------
  @Post('ban/:ip')
  async banIp(
    @Param('ip') ip: string,
    @Headers('x-admin-key') token?: string,
    @Query('adminUserId') adminUserId?: string,
  ) {
    await this.requireAdmin(token, adminUserId);
    const banTtl = parseInt(process.env.DDOS_BAN_TTL_SECONDS ?? '3600');
    await this.redis.set(`ddos:ban:${ip}`, 'manual', 'EX', banTtl);
    return {
      message: `IP ${ip} manually banned for ${banTtl / 60} minutes.`,
      ip,
      expiresInSeconds: banTtl,
    };
  }

  // -------------------------------------------------------------------------
  // DELETE /api/admin/network/ban/:ip — Unban IP
  // -------------------------------------------------------------------------
  @Delete('ban/:ip')
  async unbanIp(
    @Param('ip') ip: string,
    @Headers('x-admin-key') token?: string,
    @Query('adminUserId') adminUserId?: string,
  ) {
    await this.requireAdmin(token, adminUserId);
    const deleted = await this.redis.del(`ddos:ban:${ip}`);
    if (!deleted) {
      throw new NotFoundException(`IP ${ip} is not currently banned.`);
    }
    await this.redis.del(`ddos:viol:${ip}`);
    return { message: `IP ${ip} unbanned successfully.`, ip };
  }
}
