import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
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
