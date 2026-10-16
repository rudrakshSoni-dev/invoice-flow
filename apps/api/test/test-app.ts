import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedDatabase } from '../prisma/seed';
import { AppModule } from '../src/app.module';
import { DomainExceptionFilter } from '../src/common/domain-exception.filter';
import { type Env, loadEnv } from '../src/common/env';
import { ENV } from '../src/common/env.module';
import { PrismaService } from '../src/common/prisma.service';
import { LLM_PROVIDER } from '../src/llm/llm-provider';
import { FILE_STORAGE } from '../src/storage/file-storage';
import { LocalFileStorage } from '../src/storage/local-file-storage';
import request from 'supertest';
import { JobWorker } from '../src/agent/job-worker.service';
import { ScriptedLlmProvider, perfectOutputFor, readFixturePdf } from './fake-llm';

export type TestApp = {
  app: INestApplication;
  prisma: PrismaService;
  llm: ScriptedLlmProvider;
  close: () => Promise<void>;
  reset: () => Promise<void>;
  /** Uploads a fixture, scripts the model's answers, and runs the queued job to completion. */
  processFixture: (file: string, ...llmOutputs: Array<string | Error>) => Promise<string>;
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

  const processFixture = async (file: string, ...llmOutputs: Array<string | Error>) => {
    llm.push(...(llmOutputs.length ? llmOutputs : [perfectOutputFor(file)]));
    const res = await request(app.getHttpServer())
      .post('/invoices')
      .attach('file', readFixturePdf(file), file);
    if (res.status !== 202)
      throw new Error(`Upload failed: ${res.status} ${JSON.stringify(res.body)}`);
    await app.get(JobWorker).runOnce();
    return res.body.id as string;
  };

  return {
    app,
    prisma,
    llm,
    processFixture,
    reset: async () => {
      llm.clear();
      await seedDatabase(prisma);
    },
    close: async () => {
      await app.close();
      await rm(uploadDir, { recursive: true, force: true });
    },
  };
}
