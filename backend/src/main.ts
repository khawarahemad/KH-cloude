import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';

async function bootstrap() {
  // Create with bodyParser disabled so we can configure it manually below
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // Raw body capture middleware — MUST run before any JSON parsing.
  // This populates req.rawBody (Buffer) which is required for GitHub webhook
  // HMAC-SHA256 signature verification (x-hub-signature-256 header).
  app.use(
    express.json({
      limit: '10mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Enable Cross-Origin Resource Sharing (CORS) for local frontend queries
  app.enableCors({
    origin: '*', // In production, restrict this to the authorized domains
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 5000);
  console.log('KH Cloud Backend API listening on http://localhost:5000');
}
bootstrap();
