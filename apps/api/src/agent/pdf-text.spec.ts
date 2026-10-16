import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractPdfText, hasUsableText } from './pdf-text';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../../../../fixtures/invoices', name));

describe('extractPdfText', () => {
  it('reads the text layer of a digital invoice', async () => {
    const text = await extractPdfText(fixture('01-clean-acme.pdf'));
    expect(text).toContain('INV-A-2041');
    expect(text).toContain('PO-1001');
    expect(hasUsableText(text)).toBe(true);
  });

  it('finds no usable text in a scanned invoice', async () => {
    const text = await extractPdfText(fixture('06-scanned-harbor.pdf'));
    expect(hasUsableText(text)).toBe(false);
  });

  it('rejects bytes that are not a parseable PDF', async () => {
    await expect(extractPdfText(Buffer.from('%PDF-1.4 truncated'))).rejects.toThrow();
  });
});
