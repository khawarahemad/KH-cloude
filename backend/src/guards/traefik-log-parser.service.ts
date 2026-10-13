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
  private recentLogSignatures = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.preloadRecentSignatures();
    this.startTailing();
  }

  onModuleDestroy() {
    if (this.tailProcess) {
      this.tailProcess.kill();
    }
  }

  private async preloadRecentSignatures() {
    try {
      const recent = await (this.prisma as any).networkLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 1000,
        select: { ip: true, path: true, statusCode: true, createdAt: true },
      });
      for (const r of recent) {
        if (r.createdAt) {
          const sig = `${r.createdAt.toISOString()}_${r.ip}_${r.path}_${r.statusCode}`;
          this.recentLogSignatures.add(sig);
        }
      }
    } catch {}
  }

  private async updateDomainCache() {
    const now = Date.now();
    // Update cache at most once every 30 seconds
    if (now - this.lastCacheUpdate < 30 * 1000) {
      return;
    }
    try {
      const baseDomain = process.env.BASE_DOMAIN || 'khawarahemad.com';
      const domains = await (this.prisma as any).domain.findMany({
        select: { hostname: true, projectId: true },
      });
      const projects = await (this.prisma as any).project.findMany({
        select: { id: true, slug: true, name: true },
      });

      this.domainCache.clear();

      for (const d of domains) {
        if (d.hostname) {
          const hn = d.hostname.toLowerCase().trim();
          this.domainCache.set(hn, d.projectId);
          if (hn.startsWith('www.')) {
            this.domainCache.set(hn.substring(4), d.projectId);
          } else {
            this.domainCache.set(`www.${hn}`, d.projectId);
          }
        }
      }

      for (const p of projects) {
        if (p.slug) {
          const s = p.slug.toLowerCase().trim();
          this.domainCache.set(`${s}.${baseDomain}`, p.id);
          this.domainCache.set(`${s.replace(/[^a-z0-9]/g, '')}.${baseDomain}`, p.id);
          this.domainCache.set(`${s.replace(/-/g, '.')}.${baseDomain}`, p.id);
        }
        if (p.name) {
          const nameSlug = p.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
          this.domainCache.set(`${nameSlug}.${baseDomain}`, p.id);
        }
      }

      this.lastCacheUpdate = now;
    } catch (err: any) {
      this.logger.error(`Failed to update domain cache: ${err.message}`);
    }
  }

  private async resolveProjectId(host: string): Promise<string | null> {
    if (!host) return null;
    host = host.toLowerCase().trim();
    if (host.includes(':')) {
      host = host.split(':')[0];
    }

    await this.updateDomainCache();

    // Direct match
    if (this.domainCache.has(host)) {
      const cached = this.domainCache.get(host);
      return cached || null;
    }
    if (host.startsWith('www.')) {
      const withoutWww = host.substring(4);
      if (this.domainCache.has(withoutWww)) {
        return this.domainCache.get(withoutWww) || null;
      }
    }

    const baseDomain = process.env.BASE_DOMAIN || 'khawarahemad.com';
    const SYSTEM_SUBDOMAINS = new Set(['cloud', 'api', 'auth', 'admin', 'storage', 'cdn', 'minio-console', 'minio']);

    if (host.endsWith(`.${baseDomain}`)) {
      const slug = host.replace(`.${baseDomain}`, '');
      if (SYSTEM_SUBDOMAINS.has(slug)) {
        this.domainCache.set(host, ''); // Negative cache
        return null;
      }
      const normalizedSlug = slug.replace(/[^a-z0-9]/g, '');
      try {
        const project = await (this.prisma as any).project.findFirst({
          where: {
            OR: [
              { slug },
              { slug: slug.replace(/\./g, '-') },
              { slug: normalizedSlug },
              { name: slug },
            ],
          },
          select: { id: true },
        });
        if (project) {
          this.domainCache.set(host, project.id);
          return project.id;
        } else {
          this.domainCache.set(host, '');
        }
      } catch {}
    }

    // Direct query on domain table
    try {
      const domain = await (this.prisma as any).domain.findFirst({
        where: {
          OR: [
            { hostname: host },
            { hostname: host.replace(/^www\./, '') },
            { hostname: `www.${host}` },
          ],
        },
        select: { projectId: true },
      });
      if (domain?.projectId) {
        this.domainCache.set(host, domain.projectId);
        return domain.projectId;
      }
    } catch {}

    return null;
  }

  private startTailing() {
    if (!fs.existsSync(this.logFilePath)) {
      this.logger.warn(`Traefik access log not found at ${this.logFilePath}. Network monitor data will start when Traefik writes traffic. Retrying in 5s...`);
      setTimeout(() => this.startTailing(), 5000);
      return;
    }

    this.logger.log(`Starting to tail Traefik access log at ${this.logFilePath}`);
    
    // Read the last 2000 lines so past traffic in log file is ingested immediately
    this.tailProcess = spawn('tail', ['-n', '2000', '-F', this.logFilePath]);

    this.tailProcess.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const logEntry = JSON.parse(line);
          void this.processLogEntry(logEntry);
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
    // ClientHost, RequestHost, RequestMethod, RequestPath, DownstreamStatus, Duration, request_User-Agent, StartUTC, time
    let ip = logEntry.ClientHost || '0.0.0.0';
    if (ip.includes(':')) {
      const parts = ip.split(':');
      if (parts.length === 2) {
        ip = parts[0];
      }
    }
    
    let host = (logEntry.RequestHost || '').toLowerCase().trim();
    if (host.includes(':')) {
      host = host.split(':')[0];
    }

    const method = logEntry.RequestMethod || 'GET';
    const path = logEntry.RequestPath || '/';
    const statusCode = parseInt(logEntry.DownstreamStatus, 10) || 200;
    const userAgent = logEntry['request_User-Agent'] || '';
    
    const durationStr = logEntry.Duration || '0';
    const responseTimeMs = Math.round(parseInt(durationStr, 10) / 1000000) || 0;

    // Ignore internal traffic or healthchecks
    if (!host || host === 'localhost' || host === '127.0.0.1') return;

    // Determine timestamp
    let logDate = new Date();
    const rawTime = logEntry.StartUTC || logEntry.time;
    if (rawTime) {
      const parsed = new Date(rawTime);
      if (!isNaN(parsed.getTime())) {
        logDate = parsed;
      }
    }

    // Deduplicate so re-reading the last 2000 lines on restart doesn't inflate counts
    const signature = `${logDate.toISOString()}_${ip}_${path}_${statusCode}`;
    if (this.recentLogSignatures.has(signature)) {
      return;
    }
    this.recentLogSignatures.add(signature);
    if (this.recentLogSignatures.size > 5000) {
      // Clear oldest signatures to keep memory bounded
      const entries = Array.from(this.recentLogSignatures);
      this.recentLogSignatures = new Set(entries.slice(entries.length - 3000));
    }

    const projectId = await this.resolveProjectId(host);

    // Filter out system platform requests (cloud, auth, api, minio) if no projectId was found
    const baseDomain = process.env.BASE_DOMAIN || 'khawarahemad.com';
    const SYSTEM_SUBDOMAINS = new Set(['cloud', 'api', 'auth', 'admin', 'storage', 'cdn', 'minio-console', 'minio']);
    if (!projectId && host.endsWith(`.${baseDomain}`)) {
      const slug = host.replace(`.${baseDomain}`, '');
      if (SYSTEM_SUBDOMAINS.has(slug)) return;
    }

    try {
      await (this.prisma as any).networkLog.create({
        data: {
          ip,
          method,
          path,
          host,
          projectId: projectId || null,
          statusCode,
          userAgent,
          responseTimeMs,
          createdAt: logDate,
        },
      });
    } catch (err: any) {
      // Silently fail on insert errors to prevent flooding logs
    }
  }
}
