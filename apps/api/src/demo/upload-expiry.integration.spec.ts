import request from 'supertest';
import { createTestApp, type TestApp } from '../../test/test-app';
import { FILE_STORAGE, type FileStorage } from '../storage/file-storage';
import { UploadExpiry } from './upload-expiry.service';

const HOUR = 3600 * 1000;

describe('UploadExpiry', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());
  const hoursFromNow = (hours: number) => new Date(Date.now() + hours * HOUR);

  beforeAll(async () => {
    t = await createTestApp({ UPLOAD_RETENTION_HOURS: 24 });
  });

  beforeEach(async () => {
    await t.reset();
    await http().post('/demo/reset').expect(200);
  });

  afterAll(() => t.close());

  it('deletes expired uploads, their files and ledger entries, and keeps the history', async () => {
    const id = await t.processFixture('01-clean-acme.pdf');
    const { fileKey } = await t.prisma.invoice.findUniqueOrThrow({ where: { id } });
    expect((await http().get('/ledger')).body.total).toBe(6);

    expect(await t.app.get(UploadExpiry).expire(hoursFromNow(25))).toBe(1);

    await http().get(`/invoices/${id}`).expect(404);
    await expect(t.app.get<FileStorage>(FILE_STORAGE).open(fileKey)).rejects.toThrow('not found');
    expect((await http().get('/invoices')).body.total).toBe(6);
    expect((await http().get('/ledger')).body.total).toBe(5);
    const po = await t.prisma.purchaseOrder.findUniqueOrThrow({ where: { poNumber: 'PO-1001' } });
    expect(po).toMatchObject({ billedMinor: 0, status: 'OPEN' });
  });

  it('keeps uploads younger than the retention window', async () => {
    const id = await t.processFixture('02-over-po-northwind.pdf');
    expect(await t.app.get(UploadExpiry).expire(hoursFromNow(23))).toBe(0);
    await http().get(`/invoices/${id}`).expect(200);
  });
});
