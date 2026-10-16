import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { NotFoundError } from './domain-errors';
import { DomainExceptionFilter } from './domain-exception.filter';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma.service';

@Controller('boom')
class BoomController {
  @Get('not-found')
  notFound(): never {
    throw new NotFoundError('Invoice 123 not found');
  }

  @Get('crash')
  crash(): never {
    throw new Error('secret internal detail');
  }
}

async function createApp(queryRaw: jest.Mock): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController, BoomController],
    providers: [{ provide: PrismaService, useValue: { $queryRaw: queryRaw } }],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.useGlobalFilters(new DomainExceptionFilter());
  await app.init();
  return app;
}

describe('HealthController', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app.close();
  });

  it('reports ok when the database responds', async () => {
    app = await createApp(jest.fn().mockResolvedValue([{ '?column?': 1 }]));
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok', database: 'up' });
  });

  it('returns 503 when the database is down', async () => {
    app = await createApp(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await request(app.getHttpServer())
      .get('/health')
      .expect(503, { error: 'DEPENDENCY_UNAVAILABLE', message: 'Database is unreachable' });
  });
});

describe('DomainExceptionFilter', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp(jest.fn());
  });

  afterAll(async () => {
    await app.close();
  });

  it('maps domain errors to their HTTP status', async () => {
    await request(app.getHttpServer())
      .get('/boom/not-found')
      .expect(404, { error: 'NOT_FOUND', message: 'Invoice 123 not found' });
  });

  it('hides internal error details', async () => {
    await request(app.getHttpServer())
      .get('/boom/crash')
      .expect(500, { error: 'INTERNAL', message: 'Unexpected error' });
  });
});
