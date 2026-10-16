import request from 'supertest';
import { createTestApp, type TestApp } from '../../test/test-app';
import { FILE_STORAGE, type FileStorage } from '../storage/file-storage';

describe('POST /demo/reset', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(() => t.reset());

  afterAll(() => t.close());

  it('loads the demo history with its PDFs, ledger and PO balances', async () => {
    const res = await http().post('/demo/reset').expect(200);
    expect(res.body).toEqual({ vendors: 6, purchaseOrders: 12, invoices: 6 });

    const stats = (await http().get('/stats')).body;
    expect(stats.byStatus).toMatchObject({ AUTO_APPROVED: 4, APPROVED: 1, REJECTED: 1 });
    expect((await http().get('/ledger')).body.total).toBe(5);

    const harbor = (await http().get('/invoices')).body.items.find(
      (i: { invoiceNumber: string }) => i.invoiceNumber === 'HP-5521',
    );
    const detail = (await http().get(`/invoices/${harbor.id}`)).body;
    expect(detail.discrepancies.map((d: { type: string }) => d.type).sort()).toEqual([
      'AMOUNT_MISMATCH',
      'QUANTITY_MISMATCH',
    ]);
    expect(detail.auditEvents.map((e: { step: string }) => e.step)).toEqual([
      'UPLOADED',
      'EXTRACTED',
      'MATCHED',
      'DECIDED',
      'REVIEWED',
      'POSTED',
    ]);
    expect(detail.purchaseOrder).toMatchObject({ status: 'CLOSED', billedMinor: 78000 });
    await http().get(`/invoices/${harbor.id}/file`).expect(200).expect('Content-Type', /pdf/);
  });

  it('makes sample invoice 3 a duplicate of the seeded BL-0917', async () => {
    await http().post('/demo/reset').expect(200);
    const id = await t.processFixture('03-duplicate-brightline.pdf');

    const invoice = (await http().get(`/invoices/${id}`)).body;
    expect(invoice.status).toBe('NEEDS_REVIEW');
    expect(invoice.discrepancies.map((d: { type: string }) => d.type)).toContain(
      'DUPLICATE_INVOICE',
    );
  });

  it('removes uploaded invoices and their files', async () => {
    const id = await t.processFixture('01-clean-acme.pdf');
    const { fileKey } = await t.prisma.invoice.findUniqueOrThrow({ where: { id } });

    await http().post('/demo/reset').expect(200);

    await http().get(`/invoices/${id}`).expect(404);
    await expect(t.app.get<FileStorage>(FILE_STORAGE).open(fileKey)).rejects.toThrow('not found');
  });
});
