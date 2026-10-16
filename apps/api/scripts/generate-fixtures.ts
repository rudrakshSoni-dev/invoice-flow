/**
 * Renders fixtures/invoices/*.pdf and fixtures/history/*.pdf from their manifest.json files.
 * Run once and commit the PDFs:
 *   pnpm --filter api fixtures:generate
 * The scanned fixture needs `pdftoppm` (poppler-utils) to rasterise the page.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, PDFFont, StandardFonts, degrees, rgb } from 'pdf-lib';
import type { ExtractedInvoiceFields } from '../src/agent/extraction.schema';
import { historySchema } from '../src/demo/demo-seed';
import { FIXTURE_DIR, loadFixtureManifest } from './fixture-manifest';

const FIXED_DATE = new Date('2026-10-01T00:00:00Z');
const PAGE = { width: 612, height: 792, margin: 56 };
const BILL_TO = [
  'InvoiceFlow Demo Co.',
  'Accounts Payable',
  '100 Market Street',
  'San Francisco, CA 94105',
];

function money(amount: string, currency: string): string {
  const [whole = '0', fraction = '00'] = amount.split('.');
  return `${currency} ${Number(whole).toLocaleString('en-US')}.${fraction.padEnd(2, '0')}`;
}

async function createDocument(): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
  doc.setProducer('InvoiceFlow fixtures');
  return doc;
}

async function renderInvoice(invoice: ExtractedInvoiceFields): Promise<Uint8Array> {
  const doc = await createDocument();
  const page = doc.addPage([PAGE.width, PAGE.height]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.12);
  const muted = rgb(0.4, 0.42, 0.45);
  const right = PAGE.width - PAGE.margin;

  const text = (
    value: string,
    x: number,
    y: number,
    size = 10,
    font: PDFFont = regular,
    color = ink,
  ) => page.drawText(value, { x, y, size, font, color });
  const textRight = (value: string, x: number, y: number, size = 10, font: PDFFont = regular) =>
    text(value, x - font.widthOfTextAtSize(value, size), y, size, font);

  let y = PAGE.height - PAGE.margin;
  text(invoice.vendorName, PAGE.margin, y, 16, bold);
  textRight('INVOICE', right, y, 22, bold);
  y -= 18;
  if (invoice.vendorTaxId)
    text(`Tax ID: ${invoice.vendorTaxId}`, PAGE.margin, y, 9, regular, muted);

  const meta: Array<[string, string]> = [
    ['Invoice no.', invoice.invoiceNumber],
    ['Issue date', invoice.issueDate],
    ['Due date', invoice.dueDate ?? 'On receipt'],
  ];
  if (invoice.poNumber) meta.push(['PO number', invoice.poNumber]);
  let metaY = y - 10;
  for (const [label, value] of meta) {
    textRight(label, right - 110, metaY, 9, regular);
    textRight(value, right, metaY, 9, bold);
    metaY -= 14;
  }

  y -= 40;
  text('Bill to', PAGE.margin, y, 9, bold, muted);
  for (const line of BILL_TO) {
    y -= 13;
    text(line, PAGE.margin, y, 10);
  }

  y = Math.min(y, metaY) - 36;
  const cols = { qty: right - 200, unit: right - 90, total: right };
  text('Description', PAGE.margin, y, 9, bold, muted);
  textRight('Qty', cols.qty, y, 9, bold);
  textRight('Unit price', cols.unit, y, 9, bold);
  textRight('Amount', cols.total, y, 9, bold);
  y -= 8;
  page.drawLine({
    start: { x: PAGE.margin, y },
    end: { x: right, y },
    thickness: 0.75,
    color: muted,
  });

  for (const line of invoice.lineItems) {
    y -= 20;
    text(line.description, PAGE.margin, y, 10);
    textRight(String(line.quantity), cols.qty, y);
    textRight(money(line.unitPrice, invoice.currency), cols.unit, y);
    textRight(money(line.total, invoice.currency), cols.total, y);
  }

  y -= 14;
  page.drawLine({
    start: { x: cols.qty - 40, y },
    end: { x: right, y },
    thickness: 0.75,
    color: muted,
  });
  const totals: Array<[string, string, PDFFont]> = [
    ['Subtotal', invoice.subtotal, regular],
    ['Tax', invoice.tax, regular],
    ['Total due', invoice.total, bold],
  ];
  for (const [label, amount, font] of totals) {
    y -= 18;
    textRight(label, cols.unit, y, 10, font);
    textRight(money(amount, invoice.currency), cols.total, y, 10, font);
  }

  text(
    'Payment terms: Net 30. Please reference the invoice number with your payment.',
    PAGE.margin,
    72,
    8,
    regular,
    muted,
  );
  return doc.save();
}

async function renderPlainText(lines: string[]): Promise<Uint8Array> {
  const doc = await createDocument();
  const page = doc.addPage([PAGE.width, PAGE.height]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  lines.forEach((line, i) =>
    page.drawText(line, {
      x: PAGE.margin,
      y: PAGE.height - PAGE.margin - i * 18,
      size: i === 0 ? 14 : 11,
      font,
    }),
  );
  return doc.save();
}

/** Rasterises a PDF and wraps the image in a new PDF with no text layer, like a scanner would. */
async function toScannedPdf(pdf: Uint8Array): Promise<Uint8Array> {
  const workDir = mkdtempSync(join(tmpdir(), 'invoiceflow-scan-'));
  try {
    writeFileSync(join(workDir, 'page.pdf'), pdf);
    execFileSync('pdftoppm', ['-r', '110', '-gray', '-png', '-singlefile', 'page.pdf', 'page'], {
      cwd: workDir,
    });
    const doc = await createDocument();
    const image = await doc.embedPng(readFileSync(join(workDir, 'page.png')));
    const page = doc.addPage([PAGE.width, PAGE.height]);
    page.drawImage(image, {
      x: 6,
      y: -4,
      width: PAGE.width,
      height: PAGE.height,
      rotate: degrees(0.6),
    });
    return doc.save();
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  for (const fixture of loadFixtureManifest()) {
    let pdf: Uint8Array;
    if (fixture.expected.isInvoice) {
      pdf = await renderInvoice(fixture.expected);
      if (fixture.render?.scanned) pdf = await toScannedPdf(pdf);
    } else {
      pdf = await renderPlainText(fixture.render?.garbage ?? ['Not an invoice']);
    }
    writeFileSync(join(FIXTURE_DIR, fixture.file), pdf);
    console.log(`wrote ${fixture.file}`);
  }

  const historyDir = join(FIXTURE_DIR, '../history');
  const history = historySchema.parse(
    JSON.parse(readFileSync(join(historyDir, 'manifest.json'), 'utf8')),
  );
  for (const entry of history.invoices) {
    writeFileSync(join(historyDir, entry.file), await renderInvoice(entry.invoice));
    console.log(`wrote history/${entry.file}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
