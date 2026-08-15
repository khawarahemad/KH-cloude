import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';

// ---------------------------------------------------------------------------
// Allowed origins — the four production domains only.
// In local dev (NODE_ENV !== 'production') we also allow localhost variants.
// ---------------------------------------------------------------------------
const PRODUCTION_ORIGINS = [
  'https://cloud.khawarahemad.com',
  'https://auth.khawarahemad.com',
  'https://cdn.khawarahemad.com',
  'https://admin.khawarahemad.com',
];

const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
];

const allowedOrigins =
  process.env.NODE_ENV === 'production'
    ? PRODUCTION_ORIGINS
    : [...PRODUCTION_ORIGINS, ...DEV_ORIGINS];

// ---------------------------------------------------------------------------
// Routes that legitimately receive large file payloads (10 MB limit).
// Everything else uses a strict 1 MB limit to prevent payload-flood attacks.
// ---------------------------------------------------------------------------
const LARGE_BODY_ROUTES = ['/api/storage/', '/api/upload'];

function isLargeBodyRoute(url: string): boolean {
  return LARGE_BODY_ROUTES.some((prefix) => url.startsWith(prefix));
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // -------------------------------------------------------------------------
  // Trust the first proxy (Traefik) so req.ip resolves to the real client IP
  // and X-Forwarded-For is honoured by the DDoS guard.
  // -------------------------------------------------------------------------
  const expressInstance = app.getHttpAdapter().getInstance() as express.Express;
  expressInstance.set('trust proxy', 1);

  // -------------------------------------------------------------------------
  // Security headers — applied to every response before any route handler.
  // -------------------------------------------------------------------------
  app.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    );
    next();
  });

  // -------------------------------------------------------------------------
  // Body parsing — route-aware limits:
  //   • Storage / upload routes  → 10 MB  (large files expected)
  //   • All other routes         →  1 MB  (strict, prevents payload floods)
  //
  // Raw body is captured for GitHub webhook HMAC verification.
  // -------------------------------------------------------------------------
  app.use((req: any, res: express.Response, next: express.NextFunction) => {
    const limit = isLargeBodyRoute(req.url) ? '10mb' : '1mb';
    express.json({
      limit,
      verify: (r: any, _res, buf) => {
        r.rawBody = buf;
      },
    })(req, res, next);
  });

  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // -------------------------------------------------------------------------
  // CORS — locked to known production domains (+ localhost in dev)
  // -------------------------------------------------------------------------
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS blocked: origin "${origin}" is not allowed`));
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 5000);
  console.log(
    `🚀 KH Cloud Backend API listening on http://localhost:${process.env.PORT ?? 5000}`,
  );
  console.log(
    `🛡️  DDoS protection active | Allowed origins: ${allowedOrigins.join(', ')}`,
  );
}

bootstrap();
