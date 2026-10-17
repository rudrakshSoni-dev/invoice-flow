import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './common/domain-exception.filter';
import type { Env } from './common/env';
import { ENV } from './common/env.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const env = app.get<Env>(ENV);
  app.useGlobalFilters(new DomainExceptionFilter());
  app.enableCors({ origin: new URL(env.APP_BASE_URL).origin });
  app.enableShutdownHooks();
  await app.listen(env.PORT);
}

void bootstrap();
