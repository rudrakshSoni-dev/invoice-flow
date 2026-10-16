import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { DomainExceptionFilter } from '../src/common/domain-exception.filter';
import { type Env, loadEnv } from '../src/common/env';
import { ENV } from '../src/common/env.module';
import { PrismaService } from '../src/common/prisma.service';
import { LLM_PROVIDER } from '../src/llm/llm-provider';
import { FILE_STORAGE } from '../src/storage/file-storage';
import { LocalFileStorage } from '../src/storage/local-file-storage';
import { ScriptedLlmProvider } from './fake-llm';

export type TestApp = {
  app: INestApplication;
  prisma: PrismaService;
  llm: ScriptedLlmProvider;
  close: () => Promise<void>;
  reset: () => Promise<void>;
};

/** Full AppModule against the test schema, with temp file storage, a scripted LLM, and no background worker. */
export async function createTestApp(envOverrides: Partial<Env> = {}): Promise<TestApp> {
  const uploadDir = await mkdtemp(join(tmpdir(), 'invoiceflow-uploads-'));
  const llm = new ScriptedLlmProvider();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue({ ...loadEnv(), WORKER_ENABLED: false, ...envOverrides })
    .overrideProvider(FILE_STORAGE)
    .useValue(new LocalFileStorage(uploadDir))
    .overrideProvider(LLM_PROVIDER)
    .useValue(llm)
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  app.useGlobalFilters(new DomainExceptionFilter());
  await app.init();
  const prisma = app.get(PrismaService);

  return {
    app,
    prisma,
    llm,
    reset: async () => {
      await prisma.$executeRawUnsafe('TRUNCATE "Invoice" CASCADE');
    },
    close: async () => {
      await app.close();
      await rm(uploadDir, { recursive: true, force: true });
    },
  };
}
