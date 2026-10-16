import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from '../app.module';
import { DomainExceptionFilter } from '../common/domain-exception.filter';
import { loadEnv } from '../common/env';
import { ENV } from '../common/env.module';
import { PrismaService } from '../common/prisma.service';
import { FILE_STORAGE } from '../storage/file-storage';
import { LocalFileStorage } from '../storage/local-file-storage';

const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n',
);
const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000';

describe('Invoices API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let uploadDir: string;

  beforeAll(async () => {
    uploadDir = await mkdtemp(join(tmpdir(), 'invoiceflow-uploads-'));
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ENV)
      .useValue({ ...loadEnv(), MAX_UPLOAD_MB: 1 })
      .overrideProvider(FILE_STORAGE)
      .useValue(new LocalFileStorage(uploadDir))
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "Invoice" CASCADE');
  });

  afterAll(async () => {
    await app.close();
    await rm(uploadDir, { recursive: true, force: true });
  });

  const upload = (data: Buffer, filename = 'invoice.pdf') =>
    request(app.getHttpServer()).post('/invoices').attach('file', data, filename);

  describe('POST /invoices', () => {
    it('stores the PDF, records the upload, and queues processing', async () => {
      const res = await upload(PDF, 'acme-1001.pdf').expect(202);
      expect(res.body).toEqual({ id: expect.any(String), status: 'PROCESSING' });

      const invoice = await prisma.invoice.findUniqueOrThrow({
        where: { id: res.body.id },
        include: { auditEvents: true, jobs: true },
      });
      expect(invoice.auditEvents).toMatchObject([
        { step: 'UPLOADED', actor: 'USER', summary: 'Uploaded acme-1001.pdf' },
      ]);
      expect(invoice.jobs).toMatchObject([{ type: 'PROCESS_INVOICE', status: 'QUEUED' }]);

      const file = await request(app.getHttpServer())
        .get(`/invoices/${res.body.id}/file`)
        .buffer(true)
        .parse((r, done) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200)
        .expect('Content-Type', 'application/pdf');
      expect(Buffer.compare(file.body as Buffer, PDF)).toBe(0);
    });

    it('rejects a non-PDF even when named .pdf', async () => {
      const res = await upload(Buffer.from('PK\u0003\u0004 not a pdf'), 'sneaky.pdf').expect(400);
      expect(res.body).toEqual({
        error: 'VALIDATION_FAILED',
        message: 'Only PDF invoices are supported',
      });
      expect(await prisma.invoice.count()).toBe(0);
    });

    it('rejects a request without a file', async () => {
      const res = await request(app.getHttpServer()).post('/invoices').expect(400);
      expect(res.body.error).toBe('VALIDATION_FAILED');
    });

    it('rejects files over MAX_UPLOAD_MB', async () => {
      const tooBig = Buffer.concat([PDF, Buffer.alloc(1024 * 1024)]);
      await upload(tooBig).expect(413);
      expect(await prisma.invoice.count()).toBe(0);
    });
  });

  describe('GET /invoices', () => {
    it('lists newest first with status filter and pagination', async () => {
      const first = await upload(PDF).expect(202);
      await upload(PDF).expect(202);
      await prisma.invoice.update({ where: { id: first.body.id }, data: { status: 'FAILED' } });

      const page = await request(app.getHttpServer()).get('/invoices?pageSize=1').expect(200);
      expect(page.body).toMatchObject({ total: 2, page: 1, pageSize: 1 });
      expect(page.body.items).toHaveLength(1);

      const failed = await request(app.getHttpServer()).get('/invoices?status=FAILED').expect(200);
      expect(failed.body.items.map((i: { id: string }) => i.id)).toEqual([first.body.id]);
    });

    it('rejects an unknown status filter', async () => {
      const res = await request(app.getHttpServer()).get('/invoices?status=PAID').expect(400);
      expect(res.body.error).toBe('VALIDATION_FAILED');
    });
  });

  describe('GET /invoices/:id', () => {
    it('returns detail with the audit trail', async () => {
      const { body } = await upload(PDF).expect(202);
      const res = await request(app.getHttpServer()).get(`/invoices/${body.id}`).expect(200);
      expect(res.body).toMatchObject({
        id: body.id,
        status: 'PROCESSING',
        lines: [],
        discrepancies: [],
        purchaseOrder: null,
        auditEvents: [{ step: 'UPLOADED' }],
      });
    });

    it('returns 404 for an unknown invoice and its file', async () => {
      await request(app.getHttpServer()).get(`/invoices/${UNKNOWN_ID}`).expect(404);
      await request(app.getHttpServer()).get(`/invoices/${UNKNOWN_ID}/file`).expect(404);
    });
  });
});
