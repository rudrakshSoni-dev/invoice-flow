import request from 'supertest';
import { createTestApp, type TestApp } from '../../test/test-app';

describe('PATCH /invoices/:id', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(() => t.reset());

  afterAll(() => t.close());

  it('lets a reviewer correct fields and records what changed', async () => {
    const id = await t.processFixture('08-math-error-northwind.pdf');

    const res = await http()
      .patch(`/invoices/${id}`)
      .send({ subtotal: '1170.00', total: '1170.00' })
      .expect(200);
    expect(res.body).toMatchObject({
      subtotalMinor: 117000,
      totalMinor: 117000,
      status: 'NEEDS_REVIEW',
    });
    expect(res.body.auditEvents.at(-1)).toMatchObject({
      step: 'REVIEWED',
      actor: 'USER',
      summary: 'Edited subtotalMinor, totalMinor',
      detail: {
        changes: {
          subtotalMinor: { from: 124000, to: 117000 },
          totalMinor: { from: 124000, to: 117000 },
        },
      },
    });
  });

  it('assigns a vendor so an unknown-vendor invoice can be approved', async () => {
    const id = await t.processFixture('04-unknown-vendor-zenith.pdf');
    const vendors = (await http().get('/vendors').expect(200)).body as Array<{
      id: string;
      name: string;
    }>;
    const cedar = vendors.find((v) => v.name === 'Cedar IT Services')!;

    const listed = await http().get('/invoices').expect(200);
    expect(listed.body.items[0]).toMatchObject({
      vendor: null,
      extractedVendorName: 'Zenith Consulting Partners',
    });

    await http().patch(`/invoices/${id}`).send({ vendorId: cedar.id }).expect(200);
    const approved = await http().post(`/invoices/${id}/approve`).send({}).expect(200);
    expect(approved.body.status).toBe('APPROVED');
  });

  it('rejects a PO that belongs to a different vendor', async () => {
    const id = await t.processFixture('02-over-po-northwind.pdf');
    const pos = (await http().get('/purchase-orders')).body as Array<{
      id: string;
      poNumber: string;
    }>;
    const acmePo = pos.find((p) => p.poNumber === 'PO-1001')!;

    const res = await http()
      .patch(`/invoices/${id}`)
      .send({ purchaseOrderId: acmePo.id })
      .expect(400);
    expect(res.body.message).toContain('different vendor');
  });

  it('validates the body', async () => {
    const id = await t.processFixture('02-over-po-northwind.pdf');
    await http().patch(`/invoices/${id}`).send({}).expect(400);
    await http().patch(`/invoices/${id}`).send({ total: '12,000' }).expect(400);
    await http().patch(`/invoices/${id}`).send({ status: 'APPROVED' }).expect(400);
  });

  it('only edits invoices that need review', async () => {
    const id = await t.processFixture('01-clean-acme.pdf');
    await http().patch(`/invoices/${id}`).send({ invoiceNumber: 'X' }).expect(409);
  });
});
