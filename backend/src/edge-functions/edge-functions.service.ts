import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DatabasesService } from '../databases/databases.service';

@Injectable()
export class EdgeFunctionsService {
  constructor(
    private prisma: PrismaService,
    private databases: DatabasesService,
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
// storage = S3-compatible client helpers
// db = Secure database query runner helper

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

    return this.prisma.edgeFunction.update({
      where: { id },
      data: {
        ...(data.code !== undefined && { code: data.code }),
        ...(data.envVars !== undefined && { envVars: data.envVars }),
        ...(data.name !== undefined && { name: data.name }),
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
      const https = require('https');

      // Build a sandboxed fetch implementation using Node.js https
      const sandboxFetch = (url: string, opts?: any) => {
        return new Promise<any>((resolve) => {
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
        });
      };

      // Storage helper — wraps S3 bucket API
      const storageHelper = {
        getObject: async (bucketName: string, key: string) => {
          const res = await sandboxFetch(
            `https://api.khawarahemad.com/api/storage/buckets/${bucketName}/presigned?key=${encodeURIComponent(key)}`,
          );
          const data = await res.json();
          return data;
        },
        listObjects: async (bucketName: string, prefix?: string) => {
          const res = await sandboxFetch(
            `https://api.khawarahemad.com/api/storage/buckets/${bucketName}/files?prefix=${prefix || ''}`,
          );
          return res.json();
        },
      };

      // Database helper - wraps DatabasesService and exposes secure queries restricted to team databases
      const dbHelper = {
        query: async (sql: string, params: any[] = []) => {
          const runningDb = await this.prisma.databaseInstance.findFirst({
            where: { teamId, status: 'RUNNING' }
          });
          if (!runningDb) throw new Error('No running database instance found for this team.');
          return this.databases.runQuery(runningDb.id, teamId, sql);
        },
        connect: (dbId: string) => {
          return {
            query: async (sql: string, params: any[] = []) => {
              const targetDb = await this.prisma.databaseInstance.findFirst({
                where: { id: dbId, teamId }
              });
              if (!targetDb) throw new Error('Unauthorized or database not found.');
              return this.databases.runQuery(dbId, teamId, sql);
            }
          };
        }
      };

      // Sandbox request context
      const requestContext = {
        method: payload.method || 'GET',
        path: payload.path || '/',
        query: payload.query || {},
        body: payload.body || null,
        headers: payload.headers || {},
      };

      // Wrap user code so it can use ES-module-like default export
      const wrappedCode = `
        ${fn.code.replace(/export\s+default\s+/, 'const __handler = ')}
        __handler({ req: __req, env: __env, storage: __storage, db: __db });
      `;

      const sandbox = vm.createContext({
        __req: requestContext,
        __env: envVars,
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
