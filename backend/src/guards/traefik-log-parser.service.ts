import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';

@Injectable()
export class TraefikLogParserService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TraefikLogParserService.name);
  private tailProcess: ChildProcess | null = null;
  private readonly logFilePath = '/var/log/kh-cloud/traefik-access.log';

  // Cache domain -> projectId mapping to avoid hitting DB for every log line
  private domainCache = new Map<string, string>();
  private lastCacheUpdate = 0;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.startTailing();
  }

  onModuleDestroy() {
    if (this.tailProcess) {
      this.tailProcess.kill();
    }
  }

  private async updateDomainCache() {
    const now = Date.now();
    // Update cache at most once every 5 minutes
    if (now - this.lastCacheUpdate < 5 * 60 * 1000) {
      return;
    }
    try {
      const domains = await (this.prisma as any).domain.findMany({
        select: { hostname: true, projectId: true },
      });
      this.domainCache.clear();
      for (const d of domains) {
        this.domainCache.set(d.hostname, d.projectId);
      }
      this.lastCacheUpdate = now;
    } catch (err: any) {
      this.logger.error(`Failed to update domain cache: ${err.message}`);
    }
  }

  private async resolveProjectId(host: string): Promise<string | null> {
    if (!host) return null;
    await this.updateDomainCache();
    // Direct match
    if (this.domainCache.has(host)) {
      return this.domainCache.get(host)!;
    }
    // Also check if it's the internal generated domain like `<project-slug>.khawarahemad.com`
    if (host.endsWith('.khawarahemad.com')) {
      const slug = host.replace('.khawarahemad.com', '');
      try {
        const project = await (this.prisma as any).project.findFirst({
          where: { slug },
          select: { id: true },
        });
        if (project) {
          this.domainCache.set(host, project.id);
          return project.id;
        }
      } catch {}
    }
    return null;
  }

  private startTailing() {
    if (!fs.existsSync(this.logFilePath)) {
      this.logger.warn(`Traefik access log not found at ${this.logFilePath}. Network monitor data for projects will be unavailable.`);
      // Retry in 1 minute
      setTimeout(() => this.startTailing(), 60000);
      return;
    }

    this.logger.log(`Starting to tail Traefik access log at ${this.logFilePath}`);
    
    this.tailProcess = spawn('tail', ['-F', this.logFilePath]);

    this.tailProcess.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const logEntry = JSON.parse(line);
          this.processLogEntry(logEntry);
        } catch (e) {
          // Ignore parse errors for partial lines
        }
      }
    });

    this.tailProcess.stderr?.on('data', (data) => {
      this.logger.error(`Tail error: ${data.toString()}`);
    });

    this.tailProcess.on('close', (code) => {
      this.logger.warn(`Tail process exited with code ${code}. Restarting in 5s...`);
      this.tailProcess = null;
      setTimeout(() => this.startTailing(), 5000);
    });
  }

  private async processLogEntry(logEntry: any) {
    // Expected JSON fields from Traefik:
    // ClientHost, RequestHost, RequestMethod, RequestPath, DownstreamStatus, Duration, request_User-Agent
    const ip = logEntry.ClientHost || '0.0.0.0';
    const host = logEntry.RequestHost;
    const method = logEntry.RequestMethod || 'GET';
    const path = logEntry.RequestPath || '/';
    const statusCode = parseInt(logEntry.DownstreamStatus, 10) || 200;
    const userAgent = logEntry['request_User-Agent'] || '';
    
    // Duration is typically in nanoseconds in Traefik JSON logs, let's convert to ms
    const durationStr = logEntry.Duration || '0';
    const responseTimeMs = Math.round(parseInt(durationStr, 10) / 1000000) || 0;

    // Ignore internal traffic or healthchecks if needed
    if (!host || host === 'localhost' || host === '127.0.0.1') return;

    const projectId = await this.resolveProjectId(host);
    
    // We only log if it belongs to a project
    if (!projectId) return;

    try {
      await (this.prisma as any).networkLog.create({
        data: {
          ip,
          method,
          path,
          host,
          projectId,
          statusCode,
          userAgent,
          responseTimeMs,
        },
      });
    } catch (err: any) {
      // Silently fail on insert errors to prevent flooding logs
    }
  }
}
