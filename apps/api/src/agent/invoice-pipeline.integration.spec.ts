import request from 'supertest';
import { perfectOutputFor, readFixturePdf } from '../../test/fake-llm';
import { createTestApp, type TestApp } from '../../test/test-app';
import { LlmError } from '../llm/llm-provider';
import { JobWorker, MAX_JOB_ATTEMPTS } from './job-worker.service';

describe('Invoice pipeline: extraction', () => {
  let t: TestApp;
  let worker: JobWorker;

  beforeAll(async () => {
    t = await createTestApp();
    worker = t.app.get(JobWorker);
  });

  beforeEach(() => t.reset());

  afterAll(() => t.close());

  async function uploadFixture(file: string): Promise<string> {
    const res = await request(t.app.getHttpServer())
      .post('/invoices')
      .attach('file', readFixturePdf(file), file)
      .expect(202);
    return res.body.id as string;
  }

  const load = (id: string) =>
    t.prisma.invoice.findUniqueOrThrow({
      where: { id },
      include: {
        lines: true,
        discrepancies: true,
        agentRuns: true,
        jobs: true,
        auditEvents: { orderBy: { createdAt: 'asc' } },
      },
    });

  it('extracts fields, lines and confidence from an uploaded invoice', async () => {
    t.llm.push(perfectOutputFor('01-clean-acme.pdf'));
    const id = await uploadFixture('01-clean-acme.pdf');

    expect(await worker.runOnce()).toBe(true);
    expect(await worker.runOnce()).toBe(false);

    const invoice = await load(id);
    expect(invoice).toMatchObject({
      status: 'PROCESSING',
      invoiceNumber: 'INV-A-2041',
      currency: 'USD',
      subtotalMinor: 138400,
      taxMinor: 11072,
      totalMinor: 149472,
      confidence: 0.95,
      rawExtraction: expect.objectContaining({
        vendorName: 'Acme Office Supplies Inc.',
        poNumber: 'PO-1001',
      }),
    });
    expect(invoice.issueDate?.toISOString()).toBe('2026-09-02T00:00:00.000Z');
    expect(invoice.lines).toHaveLength(2);
    expect(invoice.jobs).toMatchObject([{ status: 'DONE', attempts: 1 }]);
    expect(invoice.agentRuns).toMatchObject([
      {
        promptVersion: 'extract-invoice@v1',
        model: 'scripted-model',
        status: 'SUCCEEDED',
        tokensIn: 100,
      },
    ]);
    expect(invoice.auditEvents.map((e) => e.step)).toEqual(['UPLOADED', 'EXTRACTED']);
    expect(invoice.auditEvents[1]).toMatchObject({
      actor: 'AGENT',
      detail: expect.objectContaining({ mode: 'text', attempts: 1, confidence: 0.95 }),
    });
  });

  it('stores math discrepancies found during extraction', async () => {
    t.llm.push(perfectOutputFor('08-math-error-northwind.pdf'));
    const id = await uploadFixture('08-math-error-northwind.pdf');
    await worker.runOnce();

    const invoice = await load(id);
    expect(invoice.confidence).toBe(0.6);
    expect(invoice.discrepancies).toMatchObject([{ type: 'AMOUNT_MISMATCH', severity: 'WARNING' }]);
  });

  it('marks the invoice FAILED and keeps raw output after invalid responses', async () => {
    t.llm.push('{}', '{"isInvoice": "yes"}', 'not json');
    const id = await uploadFixture('01-clean-acme.pdf');
    await worker.runOnce();

    const invoice = await load(id);
    expect(invoice.status).toBe('FAILED');
    expect(invoice.rawExtraction).toMatchObject({
      rawOutputs: ['{}', '{"isInvoice": "yes"}', 'not json'],
    });
    expect(invoice.agentRuns.map((r) => r.status)).toEqual([
      'INVALID_OUTPUT',
      'INVALID_OUTPUT',
      'INVALID_OUTPUT',
    ]);
    expect(invoice.jobs).toMatchObject([{ status: 'DONE' }]);
    expect(invoice.auditEvents.at(-1)?.summary).toMatch(/^Extraction failed/);
  });

  it('fails a non-invoice document cleanly', async () => {
    t.llm.push(perfectOutputFor('10-garbage.pdf'));
    const id = await uploadFixture('10-garbage.pdf');
    await worker.runOnce();

    const invoice = await load(id);
    expect(invoice.status).toBe('FAILED');
    expect(invoice.lines).toEqual([]);
    expect(invoice.auditEvents.at(-1)?.summary).toContain('Not an invoice');
  });

  it('requeues the job with backoff on a retryable LLM error', async () => {
    t.llm.push(new LlmError('Gemini returned 429', true));
    const id = await uploadFixture('01-clean-acme.pdf');
    await worker.runOnce();

    const invoice = await load(id);
    expect(invoice.status).toBe('PROCESSING');
    expect(invoice.jobs).toMatchObject([
      { status: 'QUEUED', attempts: 1, lastError: 'Gemini returned 429' },
    ]);
    expect(invoice.jobs[0]!.runAt.getTime()).toBeGreaterThan(Date.now());
    expect(await worker.runOnce()).toBe(false);
  });

  it('fails the invoice after the last attempt', async () => {
    t.llm.push(new LlmError('Gemini returned 503', true));
    const id = await uploadFixture('01-clean-acme.pdf');
    await t.prisma.job.updateMany({
      where: { invoiceId: id },
      data: { attempts: MAX_JOB_ATTEMPTS - 1 },
    });
    await worker.runOnce();

    const invoice = await load(id);
    expect(invoice.status).toBe('FAILED');
    expect(invoice.jobs).toMatchObject([{ status: 'FAILED', attempts: MAX_JOB_ATTEMPTS }]);
    expect(invoice.auditEvents.at(-1)?.summary).toBe('Processing failed: Gemini returned 503');
  });

  it('fails immediately on a non-retryable LLM error', async () => {
    t.llm.push(new LlmError('LLM_API_KEY is not set', false));
    const id = await uploadFixture('01-clean-acme.pdf');
    await worker.runOnce();

    const invoice = await load(id);
    expect(invoice.status).toBe('FAILED');
    expect(invoice.jobs).toMatchObject([{ status: 'FAILED', attempts: 1 }]);
  });
});
