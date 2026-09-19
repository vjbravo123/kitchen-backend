import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);
  const prefix = config.get<string>('apiPrefix');

  app.setGlobalPrefix(prefix);
  app.enableCors({ origin: true, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,          // strip unknown properties
      forbidNonWhitelisted: true, // reject payloads containing them (e.g. client-side totals)
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  const port = config.get<number>('port');
  await app.listen(port);

  new Logger('Bootstrap').log(`Kitchen Costing API running on http://localhost:${port}/${prefix}`);
}

bootstrap();
