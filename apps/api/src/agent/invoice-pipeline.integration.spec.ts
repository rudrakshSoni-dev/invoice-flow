import request from 'supertest';
import { perfectOutputFor, readFixturePdf } from '../../test/fake-llm';
import { createTestApp, type TestApp } from '../../test/test-app';
import { LlmError } from '../llm/llm-provider';
import { JobWorker, MAX_JOB_ATTEMPTS } from './job-worker.service';

describe('Invoice pipeline', () => {
  let t: TestApp;
  let worker: JobWorker;

  beforeAll(async () => {
    t = await createTestApp();
    worker = t.app.get(JobWorker);
  });

  beforeEach(() => t.reset());

  afterAll(() => t.close());

  const load = (id: string) =>
    t.prisma.invoice.findUniqueOrThrow({
      where: { id },
      include: {
        lines: true,
        discrepancies: true,
        agentRuns: true,
        jobs: true,
        ledgerEntries: true,
        vendor: true,
        purchaseOrder: true,
        auditEvents: { orderBy: { createdAt: 'asc' } },
      },
    });

  const issues = (invoice: Awaited<ReturnType<typeof load>>) =>
    invoice.discrepancies.map((d) => `${d.type}:${d.severity}`).sort();

  describe('fixture scenarios with a perfect model', () => {
    it.each([
      ['01-clean-acme.pdf', 'AUTO_APPROVED', []],
      ['02-over-po-northwind.pdf', 'NEEDS_REVIEW', ['AMOUNT_MISMATCH:BLOCKING']],
      [
        '04-unknown-vendor-zenith.pdf',
        'NEEDS_REVIEW',
        ['NO_MATCHING_PO:WARNING', 'UNKNOWN_VENDOR:BLOCKING'],
      ],
      ['05-currency-lumen.pdf', 'NEEDS_REVIEW', ['CURRENCY_MISMATCH:BLOCKING']],
      ['06-scanned-harbor.pdf', 'AUTO_APPROVED', []],
      [
        '07-quantity-acme.pdf',
        'NEEDS_REVIEW',
        ['AMOUNT_MISMATCH:BLOCKING', 'QUANTITY_MISMATCH:BLOCKING'],
      ],
      [
        '08-math-error-northwind.pdf',
        'NEEDS_REVIEW',
        ['AMOUNT_MISMATCH:BLOCKING', 'AMOUNT_MISMATCH:WARNING', 'LOW_CONFIDENCE:WARNING'],
      ],
      ['09-no-po-cedar.pdf', 'AUTO_APPROVED', ['NO_MATCHING_PO:INFO']],
      ['10-garbage.pdf', 'FAILED', []],
    ])('%s → %s', async (file, status, expectedIssues) => {
      const invoice = await load(await t.processFixture(file));
      expect(invoice.status).toBe(status);
      expect(issues(invoice)).toEqual(expectedIssues);
      expect(invoice.ledgerEntries).toHaveLength(status === 'AUTO_APPROVED' ? 1 : 0);
    });

    it('03 flags a duplicate invoice number from the same vendor', async () => {
      const first = await load(await t.processFixture('03-duplicate-brightline.pdf'));
      expect(first.status).toBe('AUTO_APPROVED');

      const second = await load(await t.processFixture('03-duplicate-brightline.pdf'));
      expect(second.status).toBe('NEEDS_REVIEW');
      expect(issues(second)).toContain('DUPLICATE_INVOICE:BLOCKING');
    });
  });

  it('records the full audit trail and posts an auto-approved invoice to the ledger', async () => {
    const invoice = await load(await t.processFixture('01-clean-acme.pdf'));

    expect(invoice).toMatchObject({
      invoiceNumber: 'INV-A-2041',
      subtotalMinor: 138400,
      totalMinor: 149472,
      confidence: 0.95,
      vendor: { name: 'Acme Office Supplies Inc.' },
      purchaseOrder: { poNumber: 'PO-1001', billedMinor: 138400, status: 'CLOSED' },
      ledgerEntries: [{ amountMinor: 149472, currency: 'USD', accountCode: '6000' }],
    });
    expect(invoice.lines).toHaveLength(2);
    expect(invoice.jobs).toMatchObject([{ status: 'DONE', attempts: 1 }]);
    expect(invoice.agentRuns).toMatchObject([
      { promptVersion: 'extract-invoice@v1', status: 'SUCCEEDED' },
    ]);

    const trail = invoice.auditEvents;
    expect(trail.map((e) => `${e.step}:${e.actor}`)).toEqual([
      'UPLOADED:USER',
      'EXTRACTED:AGENT',
      'MATCHED:AGENT',
      'DECIDED:AGENT',
      'POSTED:AGENT',
    ]);
    expect(trail[2]?.summary).toBe(
      'Vendor: Acme Office Supplies Inc. (by taxId). PO: PO-1001 (by poNumber).',
    );
    expect(trail[3]?.summary).toMatch(/^Auto-approved/);
  });

  it('asks the model to explain why an invoice needs review', async () => {
    const explanation =
      'The invoice is 5% over the purchase order. Confirm the extra freight cost with the vendor before approving.';
    const id = await t.processFixture(
      '02-over-po-northwind.pdf',
      perfectOutputFor('02-over-po-northwind.pdf'),
      JSON.stringify({ explanation }),
    );

    const invoice = await load(id);
    expect(invoice.auditEvents.find((e) => e.step === 'DECIDED')?.detail).toMatchObject({
      decision: 'NEEDS_REVIEW',
      explanation,
      explanationSource: 'llm',
    });
    expect(invoice.agentRuns.map((r) => r.promptVersion).sort()).toEqual([
      'explain-discrepancies@v1',
      'extract-invoice@v1',
    ]);
    expect(t.llm.requests[1]?.prompt).toContain('5.0% over');
  });

  it('falls back to the rule messages when the explanation call fails', async () => {
    const id = await t.processFixture(
      '05-currency-lumen.pdf',
      perfectOutputFor('05-currency-lumen.pdf'),
      new LlmError('Gemini returned 503', true),
    );

    const invoice = await load(id);
    expect(invoice.status).toBe('NEEDS_REVIEW');
    expect(invoice.auditEvents.find((e) => e.step === 'DECIDED')?.detail).toMatchObject({
      explanation: 'Invoice is billed in USD but PO-1004 is in EUR.',
      explanationSource: 'rules',
    });
  });

  it('marks the invoice FAILED and keeps raw output after invalid responses', async () => {
    const invoice = await load(
      await t.processFixture('01-clean-acme.pdf', '{}', '{"isInvoice": "yes"}', 'not json'),
    );
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
    expect(invoice.lines).toEqual([]);
    expect(invoice.auditEvents.at(-1)?.summary).toMatch(/^Extraction failed/);
  });

  describe('job retries', () => {
    async function uploadOnly(file: string): Promise<string> {
      const res = await request(t.app.getHttpServer())
        .post('/invoices')
        .attach('file', readFixturePdf(file), file);
      return res.body.id as string;
    }

    it('requeues the job with backoff on a retryable LLM error', async () => {
      t.llm.push(new LlmError('Gemini returned 429', true));
      const id = await uploadOnly('01-clean-acme.pdf');
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
      const id = await uploadOnly('01-clean-acme.pdf');
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
      const id = await uploadOnly('01-clean-acme.pdf');
      await worker.runOnce();

      const invoice = await load(id);
      expect(invoice.status).toBe('FAILED');
      expect(invoice.jobs).toMatchObject([{ status: 'FAILED', attempts: 1 }]);
    });
  });
});
