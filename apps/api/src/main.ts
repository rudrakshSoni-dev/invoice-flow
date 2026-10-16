import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './common/domain-exception.filter';
import { loadEnv } from './common/env';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new DomainExceptionFilter());
  app.enableCors({ origin: env.APP_BASE_URL });
  app.enableShutdownHooks();
  await app.listen(env.PORT);
}

void bootstrap();
