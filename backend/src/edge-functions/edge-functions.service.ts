import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DatabasesService } from '../databases/databases.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class EdgeFunctionsService {
  constructor(
    private prisma: PrismaService,
    private databases: DatabasesService,
    private storage: StorageService,
  ) {}

  async getFunctions(teamId: string) {
    return this.prisma.edgeFunction.findMany({
      where: { teamId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createFunction(data: { name: string; teamId: string }) {
    const slug = data.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 40);

    const existing = await this.prisma.edgeFunction.findUnique({
      where: { teamId_slug: { teamId: data.teamId, slug } },
    });

    if (existing) {
      throw new BadRequestException(`A function with slug "${slug}" already exists in this team.`);
    }

    return this.prisma.edgeFunction.create({
      data: {
        name: data.name,
        slug,
        teamId: data.teamId,
        code: `// KH Cloud Edge Function: ${data.name}
// Available context: { req, env, storage, db }
// env = your defined environment variables
// storage = S3-compatible client helpers (getObject, listObjects, getUrl)
// db = Secure database query runner helper (query, connect)

export default async function handler({ req, env, storage, db }) {
  const { method, path, query, body, headers } = req;

  // Example: read from Object Storage
  // const file = await storage.getObject('my-bucket', 'data/config.json');

  // Example: query database
  // const result = await db.query('SELECT * FROM storage_buckets LIMIT 5');

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      message: 'Hello from ${data.name}!',
      method,
      path,
      timestamp: new Date().toISOString(),
    },
  };
}`,
      },
    });
  }

  async updateFunction(id: string, teamId: string, data: { code?: string; envVars?: string; name?: string }) {
    const fn = await this.prisma.edgeFunction.findFirst({ where: { id, teamId } });
    if (!fn) throw new NotFoundException('Edge function not found.');

    let slug = fn.slug;
    if (data.name && data.name !== fn.name) {
      slug = data.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 40);
      const existing = await this.prisma.edgeFunction.findFirst({
        where: { teamId, slug, id: { not: id } },
      });
      if (existing) {
        throw new BadRequestException(`An edge function with slug "${slug}" already exists in this team.`);
      }
    }

    return this.prisma.edgeFunction.update({
      where: { id },
      data: {
        ...(data.code !== undefined && { code: data.code }),
        ...(data.envVars !== undefined && { envVars: data.envVars }),
        ...(data.name !== undefined && { name: data.name, slug }),
      },
    });
  }

  async deleteFunction(id: string, teamId: string) {
    const fn = await this.prisma.edgeFunction.findFirst({ where: { id, teamId } });
    if (!fn) throw new NotFoundException('Edge function not found.');

    await this.prisma.edgeFunction.delete({ where: { id } });
    return { success: true };
  }

  async invokeFunction(
    id: string,
    teamId: string,
    payload: {
      method?: string;
      path?: string;
      query?: Record<string, any>;
      body?: any;
      headers?: Record<string, string>;
    },
  ) {
    const fn = await this.prisma.edgeFunction.findFirst({ where: { id, teamId } });
    if (!fn) throw new NotFoundException('Edge function not found.');

    let envVars: Record<string, string> = {};
    try {
      envVars = JSON.parse(fn.envVars || '{}');
    } catch {}

    const startTime = Date.now();
    const logs: string[] = [];

    try {
      // Create isolated sandbox context using Node.js vm module
      const vm = require('vm');

      // Build a sandboxed fetch implementation using Node.js http/https
      const sandboxFetch = (url: string, opts?: any) => {
        return new Promise<any>((resolve) => {
          try {
            const mod = require(url.startsWith('https') ? 'https' : 'http');
            const options = {
              ...opts,
              headers: { 'Content-Type': 'application/json', ...(opts?.headers || {}) },
            };
            const req = mod.request(url, options, (res: any) => {
              let data = '';
              res.on('data', (d: any) => (data += d));
              res.on('end', () => {
                resolve({
                  ok: res.statusCode < 400,
                  status: res.statusCode,
                  json: () => Promise.resolve(JSON.parse(data)),
                  text: () => Promise.resolve(data),
                });
              });
            });
            req.on('error', (err: any) => resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: err.message }) }));
            if (opts?.body) req.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));
            req.end();
          } catch (e: any) {
            resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: e.message }) });
          }
        });
      };

      // Direct in-process storage helper — ultra fast, no network latency
      const storageHelper = {
        getObject: async (bucketName: string, key: string) => {
          try {
            const { bucket, buffer } = await this.storage.getFileByBucketName(bucketName, key, teamId);
            return {
              ok: true,
              bucket: bucket.name,
              key,
              size: buffer.length,
              text: () => buffer.toString('utf-8'),
              json: () => JSON.parse(buffer.toString('utf-8')),
            };
          } catch (err: any) {
            return { ok: false, error: err.message };
          }
        },
        listObjects: async (bucketName: string, prefix?: string) => {
          const bucket = await this.prisma.bucket.findFirst({ where: { teamId, name: bucketName } });
          if (!bucket) return [];
          return this.storage.listFiles(bucket.id, prefix || '');
        },
        getUrl: async (bucketName: string, key: string) => {
          const bucket = await this.prisma.bucket.findFirst({ where: { teamId, name: bucketName } });
          if (!bucket) return null;
          return this.storage.generatePresignedUrl(bucket.id, key);
        },
      };

      // Database helper - wraps DatabasesService with direct query access
      const dbHelper = {
        query: async (sql: string) => {
          const runningDb = await this.prisma.databaseInstance.findFirst({
            where: { teamId, status: 'RUNNING' },
          });
          if (!runningDb) throw new Error('No running database instance found for this team.');
          return this.databases.runQuery(runningDb.id, teamId, sql);
        },
        connect: (dbId: string) => {
          return {
            query: async (sql: string) => {
              const targetDb = await this.prisma.databaseInstance.findFirst({
                where: { id: dbId, teamId },
              });
              if (!targetDb) throw new Error('Unauthorized or database not found.');
              return this.databases.runQuery(dbId, teamId, sql);
            },
          };
        },
      };

      // Sandbox request context
      const requestContext = {
        method: payload.method || 'GET',
        path: payload.path || '/',
        query: payload.query || {},
        body: payload.body || null,
        headers: payload.headers || {},
      };

      // Wrap user code so it safely exposes handler
      let transformedCode = fn.code.trim();
      if (/export\s+default\s+/.test(transformedCode)) {
        transformedCode = transformedCode.replace(/export\s+default\s+/, 'const __handler = ');
      } else if (/module\.exports\s*=/.test(transformedCode)) {
        transformedCode = transformedCode.replace(/module\.exports\s*=/, 'const __handler = ');
      } else {
        transformedCode = `const __handler = (${transformedCode});`;
      }

      const wrappedCode = `
        "use strict";
        ${transformedCode}
        if (typeof __handler !== 'function') {
          throw new Error('Edge function must export a default function handler.');
        }
        __handler({ req: __req, env: __env, storage: __storage, db: __db });
      `;

      const sandbox = vm.createContext({
        __req: requestContext,
        __env: Object.freeze({ ...envVars }),
        __storage: storageHelper,
        __db: dbHelper,
        fetch: sandboxFetch,
        console: {
          log: (...args: any[]) => logs.push('[LOG] ' + args.join(' ')),
          error: (...args: any[]) => logs.push('[ERROR] ' + args.join(' ')),
          warn: (...args: any[]) => logs.push('[WARN] ' + args.join(' ')),
        },
        JSON,
        Promise,
        setTimeout,
        clearTimeout,
        Date,
        Math,
        Object,
        Array,
        String,
        Number,
        Boolean,
        Error,
        Buffer: {
          from: Buffer.from,
          isBuffer: Buffer.isBuffer,
        },
        undefined,
        null: null,
      });

      const result = await vm.runInContext(wrappedCode, sandbox, { timeout: 10000 });
      const duration = Date.now() - startTime;

      // Update invoke stats
      await this.prisma.edgeFunction.update({
        where: { id },
        data: {
          invokeCount: { increment: 1 },
          lastInvokedAt: new Date(),
        },
      });

      return {
        success: true,
        duration,
        logs,
        result: result ?? { status: 200, body: null },
      };
    } catch (err: any) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        duration,
        logs,
        error: err.message || 'Execution failed.',
      };
    }
  }
}
