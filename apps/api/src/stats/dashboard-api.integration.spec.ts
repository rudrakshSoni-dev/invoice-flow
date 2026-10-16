import request from 'supertest';
import { createTestApp, type TestApp } from '../../test/test-app';
import { JobWorker } from '../agent/job-worker.service';
import { type InvoiceEvent, InvoiceEvents } from '../events/invoice-events';

describe('Dashboard API', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(() => t.reset());

  afterAll(() => t.close());

  it('GET /stats summarises outcomes', async () => {
    const empty = await http().get('/stats').expect(200);
    expect(empty.body).toMatchObject({
      total: 0,
      processed: 0,
      autoApprovalRate: null,
      avgProcessingMs: null,
    });

    await t.processFixture('01-clean-acme.pdf');
    await t.processFixture('02-over-po-northwind.pdf');
    await t.processFixture('09-no-po-cedar.pdf');
    await t.processFixture('10-garbage.pdf');

    const res = await http().get('/stats').expect(200);
    expect(res.body).toMatchObject({
      total: 4,
      processed: 4,
      needsReview: 1,
      autoApprovalRate: 0.5,
      byStatus: { AUTO_APPROVED: 2, NEEDS_REVIEW: 1, FAILED: 1, PROCESSING: 0 },
    });
    expect(res.body.avgProcessingMs).toEqual(expect.any(Number));
  });

  it('lists samples and uploads one through the normal pipeline', async () => {
    const samples = await http().get('/samples').expect(200);
    expect(samples.body).toHaveLength(10);
    expect(samples.body[0]).toEqual({
      id: '01-clean-acme',
      file: '01-clean-acme.pdf',
      scenario: expect.stringContaining('Clean invoice'),
    });

    const res = await http().post('/samples/01-clean-acme').expect(202);
    expect(res.body.status).toBe('PROCESSING');
    await http().post('/samples/not-a-sample').expect(404);
  });

  it('emits status and stage events as an invoice moves through the pipeline', async () => {
    const events: InvoiceEvent[] = [];
    const subscription = t.app.get(InvoiceEvents).stream.subscribe((e) => events.push(e));

    t.llm.push(JSON.stringify({ isInvoice: false, reason: 'notes' }));
    const { body } = await http().post('/samples/01-clean-acme').expect(202);
    await t.app.get(JobWorker).runOnce();
    subscription.unsubscribe();

    expect(events).toEqual([
      { type: 'invoice.status', invoiceId: body.id, status: 'PROCESSING' },
      { type: 'invoice.stage', invoiceId: body.id, stage: 'EXTRACT' },
      { type: 'invoice.status', invoiceId: body.id, status: 'FAILED' },
    ]);
  });
});
