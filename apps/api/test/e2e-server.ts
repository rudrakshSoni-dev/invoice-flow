/**
 * Boots the compiled API with FixtureLlmProvider on its own `e2e` schema.
 *   pnpm --filter api serve:fixtures
 * Used by Playwright and for local UI work without an LLM key.
 */
import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { seedDatabase } from '../prisma/seed';
import { FixtureLlmProvider } from './fixture-llm';

// The compiled app carries Nest's decorator metadata, which tsx cannot emit from source, so it
// is loaded from dist with require (typed against the source modules).
/* eslint-disable @typescript-eslint/no-require-imports */
const { AppModule } = require('../dist/app.module') as typeof import('../src/app.module');
const { DomainExceptionFilter } =
  require('../dist/common/domain-exception.filter') as typeof import('../src/common/domain-exception.filter');
const { LLM_PROVIDER } =
  require('../dist/llm/llm-provider') as typeof import('../src/llm/llm-provider');

async function main(): Promise<void> {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL is required');
  const url = new URL(base);
  url.searchParams.set('schema', process.env.E2E_SCHEMA ?? 'e2e');
  process.env.DATABASE_URL = url.toString();
  process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'invoiceflow-e2e-'));
  process.env.WORKER_ENABLED = 'true';
  const port = Number(process.env.E2E_PORT ?? 3100);
  process.env.APP_BASE_URL = process.env.E2E_WEB_URL ?? 'http://localhost:5174';

  execSync('prisma migrate deploy', { stdio: 'ignore', env: process.env });
  const prisma = new PrismaClient();
  await seedDatabase(prisma);
  await prisma.$disconnect();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(LLM_PROVIDER)
    .useValue(new FixtureLlmProvider())
    .compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalFilters(new DomainExceptionFilter());
  app.enableCors({ origin: process.env.APP_BASE_URL });
  app.enableShutdownHooks();
  await app.listen(port);
  console.log(`Fixture API listening on http://localhost:${port}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
