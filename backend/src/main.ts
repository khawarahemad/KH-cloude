import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';
import cookieParser from 'cookie-parser';

// ---------------------------------------------------------------------------
// Allowed CORS origins — configured dynamically via BASE_DOMAIN.
// Allows system subdomains (cloud, auth, cdn, admin, storage), apex domain,
// and user project subdomains (*.<BASE_DOMAIN>).
// In local development (NODE_ENV !== 'production'), localhost origins are also permitted.
// ---------------------------------------------------------------------------
const baseDomain = process.env.BASE_DOMAIN || 'khawarahemad.com';

const PRODUCTION_ORIGINS = [
  `https://cloud.${baseDomain}`,
  `https://auth.${baseDomain}`,
  `https://cdn.${baseDomain}`,
  `https://admin.${baseDomain}`,
  `https://storage.${baseDomain}`,
  `https://${baseDomain}`,
];

const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://localhost:5000',
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
  // Cookie parser — required for JwtAuthGuard to read HttpOnly session cookies
  // -------------------------------------------------------------------------
  app.use(cookieParser());

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
  // CORS — locked to configured BASE_DOMAIN ecosystem (+ localhost in dev)
  // -------------------------------------------------------------------------
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);

      try {
        const url = new URL(origin);
        const host = url.hostname;

        // Allow localhost and 127.0.0.1 strictly in non-production environments
        if (process.env.NODE_ENV !== 'production' && (host === 'localhost' || host === '127.0.0.1')) {
          return callback(null, true);
        }

        // Allow apex domain and any subdomain under baseDomain
        if (host === baseDomain || host.endsWith(`.${baseDomain}`)) {
          return callback(null, true);
        }

        // Check explicit allowedOrigins list
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
      } catch {
        // Invalid origin URL format
      }

      callback(new Error(`CORS blocked: origin "${origin}" is not allowed`));
    },
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-admin-key',
      'x-team-id',
      'apikey',
      'x-api-key',
      'x-github-event',
      'x-hub-signature-256',
    ],
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
