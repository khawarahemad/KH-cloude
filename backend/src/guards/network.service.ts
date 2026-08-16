import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface LogRequestParams {
  ip: string;
  method: string;
  path: string;
  statusCode: number;
  userAgent?: string;
  responseTimeMs?: number;
}

@Injectable()
export class NetworkService implements OnModuleInit {
  private readonly logger = new Logger(NetworkService.name);
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Run cleanup on boot and every 6 hours automatically
    void this.deleteOldLogs();
    this.cleanupInterval = setInterval(() => {
      void this.deleteOldLogs();
    }, 6 * 60 * 60 * 1000);
  }

  /**
   * Non-blocking request logging
   */
  async logRequest(params: LogRequestParams): Promise<void> {
    try {
      await (this.prisma as any).networkLog.create({
        data: {
          ip: params.ip,
          method: params.method,
          path: params.path,
          statusCode: params.statusCode,
          userAgent: params.userAgent || null,
          responseTimeMs: params.responseTimeMs || 0,
        },
      });
    } catch (err: any) {
      this.logger.error(`Failed to log network request: ${err.message}`);
    }
  }

  /**
   * Delete records older than 7 days
   */
  async deleteOldLogs(): Promise<{ deletedCount: number }> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    try {
      const result = await (this.prisma as any).networkLog.deleteMany({
        where: {
          createdAt: {
            lt: sevenDaysAgo,
          },
        },
      });
      if (result.count > 0) {
        this.logger.log(`🧹 Purged ${result.count} network log entries older than 7 days.`);
      }
      return { deletedCount: result.count };
    } catch (err: any) {
      this.logger.error(`Failed to delete old network logs: ${err.message}`);
      return { deletedCount: 0 };
    }
  }

  /**
   * Fetch complete 7-day network monitoring statistics & top IPs
   */
  async getStats(projectId?: string) {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const whereClause: any = {
      createdAt: {
        gte: sevenDaysAgo,
      },
    };

    if (projectId) {
      whereClause.projectId = projectId;
    }

    // Fetch all records within the last 7 days
    const logs7d: any[] = await (this.prisma as any).networkLog.findMany({
      where: whereClause,
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        ip: true,
        method: true,
        path: true,
        statusCode: true,
        responseTimeMs: true,
        createdAt: true,
      },
    });

    const totalRequests7d = logs7d.length;
    const logs24h = logs7d.filter((l: any) => l.createdAt >= twentyFourHoursAgo);
    const totalRequests24h = logs24h.length;

    // Unique IPs
    const uniqueIps7d = new Set(logs7d.map((l: any) => l.ip)).size;
    const uniqueIps24h = new Set(logs24h.map((l: any) => l.ip)).size;

    // Rate limited hits (429)
    const rateLimitedCount7d = logs7d.filter((l: any) => l.statusCode === 429).length;

    // Status breakdown
    const statusDistribution = {
      '2xx': 0,
      '3xx': 0,
      '4xx': 0,
      '429': 0,
      '5xx': 0,
    };

    logs7d.forEach((l: any) => {
      if (l.statusCode === 429) {
        statusDistribution['429']++;
      } else if (l.statusCode >= 200 && l.statusCode < 300) {
        statusDistribution['2xx']++;
      } else if (l.statusCode >= 300 && l.statusCode < 400) {
        statusDistribution['3xx']++;
      } else if (l.statusCode >= 400 && l.statusCode < 500) {
        statusDistribution['4xx']++;
      } else if (l.statusCode >= 500) {
        statusDistribution['5xx']++;
      }
    });

    // 7-day trend breakdown (by day)
    const dailyMap = new Map<string, { date: string; requests: number; uniqueIps: Set<string> }>();

    // Pre-populate last 7 days so every day is present
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split('T')[0];
      dailyMap.set(key, { date: key, requests: 0, uniqueIps: new Set() });
    }

    logs7d.forEach((l: any) => {
      const dateKey = l.createdAt.toISOString().split('T')[0];
      if (dailyMap.has(dateKey)) {
        const item = dailyMap.get(dateKey)!;
        item.requests++;
        item.uniqueIps.add(l.ip);
      }
    });

    const dailyTrends = Array.from(dailyMap.values()).map((item) => ({
      date: item.date,
      requests: item.requests,
      uniqueIps: item.uniqueIps.size,
    }));

    // Top hitting IPs breakdown
    const ipMap = new Map<
      string,
      {
        ip: string;
        totalHits: number;
        hits24h: number;
        lastSeen: Date;
        lastPath: string;
        status2xx: number;
        status4xx: number;
        status429: number;
        status5xx: number;
      }
    >();

    logs7d.forEach((l: any) => {
      if (!ipMap.has(l.ip)) {
        ipMap.set(l.ip, {
          ip: l.ip,
          totalHits: 0,
          hits24h: 0,
          lastSeen: l.createdAt,
          lastPath: l.path,
          status2xx: 0,
          status4xx: 0,
          status429: 0,
          status5xx: 0,
        });
      }
      const entry = ipMap.get(l.ip)!;
      entry.totalHits++;
      if (l.createdAt >= twentyFourHoursAgo) {
        entry.hits24h++;
      }
      if (l.createdAt > entry.lastSeen) {
        entry.lastSeen = l.createdAt;
        entry.lastPath = l.path;
      }
      if (l.statusCode === 429) entry.status429++;
      else if (l.statusCode >= 200 && l.statusCode < 300) entry.status2xx++;
      else if (l.statusCode >= 400 && l.statusCode < 500) entry.status4xx++;
      else if (l.statusCode >= 500) entry.status5xx++;
    });

    const topIps = Array.from(ipMap.values())
      .sort((a, b) => b.totalHits - a.totalHits)
      .slice(0, 50);

    // Recent 50 logs feed
    const recentLogs = logs7d.slice(0, 50);

    return {
      overview: {
        totalRequests7d,
        totalRequests24h,
        uniqueIps7d,
        uniqueIps24h,
        rateLimitedCount7d,
        retentionDays: 7,
      },
      dailyTrends,
      statusDistribution,
      topIps,
      recentLogs,
    };
  }
}
