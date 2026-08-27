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
      // Create isolated sandbox using isolated-vm (true V8 isolate)
      const ivm = require('isolated-vm');
      const isolate = new ivm.Isolate({ memoryLimit: 128 });
      const context = isolate.createContextSync();
      const jail = context.global;
      jail.setSync('global', jail.derefInto());

      // Build a sandboxed fetch implementation
      const sandboxFetch = async (url: string, opts?: any) => {
        // ... (Network restrictions would go here, per D-06 / H-06)
        if (!url.startsWith('http')) throw new Error('Invalid URL');
        try {
          const mod = require(url.startsWith('https') ? 'https' : 'http');
          const options = {
            ...opts,
            headers: { 'Content-Type': 'application/json', ...(opts?.headers || {}) },
          };
          return await new Promise((resolve) => {
            const req = mod.request(url, options, (res: any) => {
              let data = '';
              res.on('data', (d: any) => (data += d));
              res.on('end', () => resolve({ ok: res.statusCode < 400, status: res.statusCode, data }));
            });
            req.on('error', (err: any) => resolve({ ok: false, status: 500, error: err.message }));
            if (opts?.body) req.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));
            req.end();
          });
        } catch (e: any) {
          return { ok: false, status: 500, error: e.message };
        }
      };

      const requestContext = {
        method: payload.method || 'GET',
        path: payload.path || '/',
        query: payload.query || {},
        body: payload.body || null,
        headers: payload.headers || {},
      };

      jail.setSync('__req', new ivm.ExternalCopy(requestContext).copyInto());
      jail.setSync('__env', new ivm.ExternalCopy(envVars).copyInto());

      // Simple wrapper to inject async callbacks into isolated-vm
      const injectAsyncCallback = (name: string, fn: (...args: any[]) => Promise<any>) => {
        jail.setSync(`__native_${name}`, new ivm.Reference(async (...args: any[]) => {
          try {
            const res = await fn(...args);
            return new ivm.ExternalCopy({ success: true, data: res }).copyInto();
          } catch (err: any) {
            return new ivm.ExternalCopy({ success: false, error: err.message }).copyInto();
          }
        }));
        context.evalSync(`
          global.${name} = async function(...args) {
            const res = await global.__native_${name}.apply(undefined, args.map(a => new ivm.ExternalCopy(a).copyInto()), { arguments: { copy: true }, result: { promise: true, copy: true } });
            if (!res.success) throw new Error(res.error);
            return res.data;
          };
        `);
      };

      injectAsyncCallback('sandboxFetch', sandboxFetch);
      
      const logRef = new ivm.Reference((...args: any[]) => logs.push('[LOG] ' + args.join(' ')));
      jail.setSync('__native_log', logRef);
      context.evalSync(`
        global.console = {
          log: (...args) => global.__native_log.applyIgnored(undefined, args.map(a => new ivm.ExternalCopy(a).copyInto()), { arguments: { copy: true } })
        };
      `);

      let transformedCode = fn.code.trim();
      if (/export\s+default\s+/.test(transformedCode)) {
        transformedCode = transformedCode.replace(/export\s+default\s+/, 'const __handler = ');
      } else if (/module\.exports\s*=/.test(transformedCode)) {
        transformedCode = transformedCode.replace(/module\.exports\s*=/, 'const __handler = ');
      } else {
        transformedCode = `const __handler = (${transformedCode});`;
      }

      const script = isolate.compileScriptSync(`
        ${transformedCode}
        if (typeof __handler !== 'function') throw new Error('Edge function must export a default function handler.');
        // We do not pass full storage/db objects yet in this limited secure sandbox to prevent complex object transfer issues.
        Promise.resolve(__handler({ req: __req, env: __env, fetch: sandboxFetch })).then(r => new ivm.ExternalCopy(r).copyInto());
      `);

      const result = await script.run(context, { promise: true, timeout: 10000 });
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
