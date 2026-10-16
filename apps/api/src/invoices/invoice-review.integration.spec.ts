import request from 'supertest';
import { perfectOutputFor } from '../../test/fake-llm';
import { createTestApp, type TestApp } from '../../test/test-app';
import { JobWorker } from '../agent/job-worker.service';
import { LlmError } from '../llm/llm-provider';

describe('Invoice review and ledger API', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(() => t.reset());

  afterAll(() => t.close());

  describe('POST /invoices/:id/approve', () => {
    it('approves a reviewed invoice and posts it to the ledger', async () => {
      const id = await t.processFixture('02-over-po-northwind.pdf');

      const res = await http()
        .post(`/invoices/${id}/approve`)
        .send({ note: 'Fuel surcharge agreed by phone' })
        .expect(200);
      expect(res.body.status).toBe('APPROVED');
      expect(res.body.auditEvents.slice(-2)).toMatchObject([
        {
          step: 'REVIEWED',
          actor: 'USER',
          summary: 'Approved by reviewer: Fuel surcharge agreed by phone',
        },
        { step: 'POSTED', actor: 'USER' },
      ]);

      const ledger = await http().get('/ledger').expect(200);
      expect(ledger.body).toMatchObject({
        total: 1,
        items: [
          {
            amountMinor: 1197000,
            currency: 'USD',
            vendor: { name: 'Northwind Logistics LLC' },
            invoice: { id },
          },
        ],
      });

      const pos = await http().get('/purchase-orders').expect(200);
      expect(pos.body.find((po: { poNumber: string }) => po.poNumber === 'PO-1002')).toMatchObject({
        billedMinor: 1197000,
        remainingMinor: -57000,
        status: 'CLOSED',
      });
    });

    it('refuses to decide the same invoice twice', async () => {
      const id = await t.processFixture('02-over-po-northwind.pdf');
      await http().post(`/invoices/${id}/approve`).send({}).expect(200);

      const res = await http().post(`/invoices/${id}/approve`).send({}).expect(409);
      expect(res.body).toMatchObject({
        error: 'INVALID_STATE',
        message: expect.stringContaining('APPROVED'),
      });
      expect((await http().get('/ledger')).body.total).toBe(1);
    });

    it('refuses auto-approved invoices', async () => {
      const id = await t.processFixture('01-clean-acme.pdf');
      await http().post(`/invoices/${id}/approve`).send({}).expect(409);
    });

    it('refuses to post an invoice from an unknown vendor and leaves it in review', async () => {
      const id = await t.processFixture('04-unknown-vendor-zenith.pdf');
      const res = await http().post(`/invoices/${id}/approve`).send({}).expect(409);
      expect(res.body.message).toContain('Assign a known vendor');

      const invoice = await http().get(`/invoices/${id}`).expect(200);
      expect(invoice.body.status).toBe('NEEDS_REVIEW');
      expect((await http().get('/ledger')).body.total).toBe(0);
    });

    it('returns 404 for an unknown invoice', async () => {
      await http()
        .post('/invoices/00000000-0000-0000-0000-000000000000/approve')
        .send({})
        .expect(404);
    });
  });

  describe('POST /invoices/:id/reject', () => {
    it('requires a reason', async () => {
      const id = await t.processFixture('05-currency-lumen.pdf');
      const res = await http().post(`/invoices/${id}/reject`).send({ reason: ' ' }).expect(400);
      expect(res.body.message).toContain('A rejection reason is required');
    });

    it('rejects without posting anything', async () => {
      const id = await t.processFixture('05-currency-lumen.pdf');
      const res = await http()
        .post(`/invoices/${id}/reject`)
        .send({ reason: 'Vendor must reissue in EUR' })
        .expect(200);

      expect(res.body.status).toBe('REJECTED');
      expect(res.body.auditEvents.at(-1)).toMatchObject({
        step: 'REVIEWED',
        summary: 'Rejected by reviewer: Vendor must reissue in EUR',
      });
      expect((await http().get('/ledger')).body.total).toBe(0);
    });
  });

  describe('POST /invoices/:id/retry', () => {
    it('requeues a failed invoice and processes it again', async () => {
      const id = await t.processFixture(
        '01-clean-acme.pdf',
        new LlmError('LLM_API_KEY is not set', false),
      );
      expect((await http().get(`/invoices/${id}`)).body.status).toBe('FAILED');

      const res = await http().post(`/invoices/${id}/retry`).expect(202);
      expect(res.body).toMatchObject({ status: 'PROCESSING', rawExtraction: null, lines: [] });
      expect(res.body.auditEvents.at(-1)).toMatchObject({
        step: 'REVIEWED',
        actor: 'USER',
        summary: 'Retry requested by reviewer',
      });

      t.llm.push(perfectOutputFor('01-clean-acme.pdf'));
      await t.app.get(JobWorker).runOnce();
      const after = (await http().get(`/invoices/${id}`)).body;
      expect(after.status).toBe('AUTO_APPROVED');
      expect(after.lines).toHaveLength(2);
    });

    it('refuses to retry an invoice that did not fail', async () => {
      const id = await t.processFixture('01-clean-acme.pdf');
      const res = await http().post(`/invoices/${id}/retry`).expect(409);
      expect(res.body.message).toContain('Only failed invoices can be retried');
    });
  });
});
