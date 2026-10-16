import {
  HIGH_CONFIDENCE,
  ScriptedLlmProvider,
  perfectOutputFor,
  readFixturePdf,
} from '../../test/fake-llm';
import { generateStructured, type StructuredLlm } from '../llm/structured-output';
import { MATH_ERROR_CONFIDENCE_CAP, extractInvoice } from './extract.stage';

function llmFrom(provider: ScriptedLlmProvider): StructuredLlm {
  return (request) => generateStructured(provider, async () => {}, request);
}

describe('extractInvoice', () => {
  it('extracts a clean digital invoice from its text layer', async () => {
    const provider = new ScriptedLlmProvider([perfectOutputFor('01-clean-acme.pdf')]);
    const result = await extractInvoice(readFixturePdf('01-clean-acme.pdf'), llmFrom(provider));

    expect(result).toMatchObject({
      ok: true,
      mode: 'text',
      attempts: 1,
      subtotalMinor: 138400,
      taxMinor: 11072,
      totalMinor: 149472,
      confidence: 0.95,
      discrepancies: [],
      fields: {
        invoiceNumber: 'INV-A-2041',
        poNumber: 'PO-1001',
        vendorName: 'Acme Office Supplies Inc.',
      },
      lines: [
        {
          description: 'A4 copy paper, 5-ream case',
          quantity: 20,
          unitPriceMinor: 4250,
          totalMinor: 85000,
        },
        {
          description: 'Black toner cartridge',
          quantity: 6,
          unitPriceMinor: 8900,
          totalMinor: 53400,
        },
      ],
    });
    const [request] = provider.requests;
    expect(request?.attachments).toEqual([]);
    expect(request?.prompt).toContain('INV-A-2041');
  });

  it('falls back to the vision model for a scanned PDF and lowers confidence', async () => {
    const pdf = readFixturePdf('06-scanned-harbor.pdf');
    const provider = new ScriptedLlmProvider([perfectOutputFor('06-scanned-harbor.pdf')]);
    const result = await extractInvoice(pdf, llmFrom(provider));

    expect(result).toMatchObject({ ok: true, mode: 'vision', totalMinor: 151940 });
    expect(result).toMatchObject({ confidence: 0.86 }); // 0.95 weakest field x 0.9 vision factor
    expect(provider.requests[0]?.attachments).toEqual([{ mimeType: 'application/pdf', data: pdf }]);
  });

  it('flags invoices whose printed math does not add up', async () => {
    const provider = new ScriptedLlmProvider([perfectOutputFor('08-math-error-northwind.pdf')]);
    const result = await extractInvoice(
      readFixturePdf('08-math-error-northwind.pdf'),
      llmFrom(provider),
    );

    expect(result).toMatchObject({
      ok: true,
      confidence: MATH_ERROR_CONFIDENCE_CAP,
      discrepancies: [
        {
          type: 'AMOUNT_MISMATCH',
          severity: 'WARNING',
          expected: '$1,170.00',
          actual: '$1,240.00',
        },
      ],
    });
  });

  it('uses the weakest field confidence as the overall score', async () => {
    const provider = new ScriptedLlmProvider([
      perfectOutputFor('01-clean-acme.pdf', { ...HIGH_CONFIDENCE, dates: 0.62 }),
    ]);
    const result = await extractInvoice(readFixturePdf('01-clean-acme.pdf'), llmFrom(provider));
    expect(result).toMatchObject({ ok: true, confidence: 0.62 });
  });

  it('fails cleanly when the document is not an invoice', async () => {
    const provider = new ScriptedLlmProvider([perfectOutputFor('10-garbage.pdf')]);
    const result = await extractInvoice(readFixturePdf('10-garbage.pdf'), llmFrom(provider));
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('Not an invoice') });
  });

  it('fails with the raw outputs after repeated invalid responses', async () => {
    const provider = new ScriptedLlmProvider(['{"isInvoice": true}', '[]', 'sorry, I cannot']);
    const result = await extractInvoice(readFixturePdf('01-clean-acme.pdf'), llmFrom(provider));
    expect(result).toMatchObject({
      ok: false,
      attempts: 3,
      rawOutputs: ['{"isInvoice": true}', '[]', 'sorry, I cannot'],
      reason: expect.stringContaining('Model output failed validation'),
    });
  });
});
