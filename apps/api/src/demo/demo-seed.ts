import {
  DiscrepancySeverity,
  DiscrepancyType,
  type Prisma,
  type PrismaClient,
} from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { extractedInvoiceFieldsSchema } from '../agent/extraction.schema';
import { formatMinor, toMinor } from '../common/money';
import { MockErpAdapter } from '../erp/mock-erp.adapter';
import type { FileStorage } from '../storage/file-storage';

const vendorsSchema = z.array(
  z.object({
    key: z.string(),
    name: z.string(),
    taxId: z.string(),
    email: z.string().email(),
  }),
);

const purchaseOrdersSchema = z.array(
  z.object({
    poNumber: z.string(),
    vendor: z.string(),
    currency: z.string().length(3),
    scenario: z.string(),
    lines: z
      .array(
        z.object({
          description: z.string(),
          quantity: z.number().int().positive(),
          unitPriceMinor: z.number().int().nonnegative(),
        }),
      )
      .min(1),
  }),
);

export const historySchema = z.object({
  purchaseOrders: purchaseOrdersSchema,
  invoices: z.array(
    z.object({
      file: z.string(),
      story: z.string(),
      daysAgo: z.number().positive(),
      processingSeconds: z.number().int().positive(),
      confidence: z.number().min(0).max(1),
      outcome: z.enum(['AUTO_APPROVED', 'APPROVED', 'REJECTED']),
      discrepancies: z
        .array(
          z.object({
            type: z.enum(DiscrepancyType),
            severity: z.enum(DiscrepancySeverity),
            message: z.string(),
            expected: z.string().optional(),
            actual: z.string().optional(),
          }),
        )
        .default([]),
      explanation: z.string().optional(),
      review: z
        .object({
          afterHours: z.number().positive(),
          note: z.string().optional(),
          reason: z.string().optional(),
        })
        .optional(),
      invoice: extractedInvoiceFieldsSchema,
    }),
  ),
});

export type HistoryInvoice = z.infer<typeof historySchema>['invoices'][number];

export type SeedOptions = {
  fixturesDir: string;
  /** When set, also loads the demo history from fixtures/history and stores its PDFs here. */
  history?: { storage: FileStorage; now?: Date };
};

export type SeedCounts = { vendors: number; purchaseOrders: number; invoices: number };

/** Storage keys of seeded history files; everything else is a visitor upload. */
export const HISTORY_FILE_PREFIX = 'history-';

const DOMAIN_TABLES =
  '"Job", "AgentRun", "LedgerEntry", "AuditEvent", "Discrepancy", "InvoiceLine", "Invoice", "PurchaseOrderLine", "PurchaseOrder", "Vendor"';

async function readJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  return schema.parse(JSON.parse(await readFile(path, 'utf8')));
}

/** Wipes all domain tables, then loads vendors, purchase orders and (optionally) demo history. */
export async function seedDatabase(
  prisma: PrismaClient,
  options: SeedOptions,
): Promise<SeedCounts> {
  const seedDir = join(options.fixturesDir, 'seed');
  const vendors = await readJson(join(seedDir, 'vendors.json'), vendorsSchema);
  const purchaseOrders = await readJson(
    join(seedDir, 'purchase-orders.json'),
    purchaseOrdersSchema,
  );
  const history = options.history
    ? await readJson(join(options.fixturesDir, 'history', 'manifest.json'), historySchema)
    : null;

  await prisma.$executeRawUnsafe(`TRUNCATE ${DOMAIN_TABLES} CASCADE`);

  const vendorIds = new Map<string, string>();
  for (const { key, ...vendor } of vendors) {
    const created = await prisma.vendor.create({ data: vendor });
    vendorIds.set(key, created.id);
  }

  const allPurchaseOrders = [...purchaseOrders, ...(history?.purchaseOrders ?? [])];
  for (const po of allPurchaseOrders) {
    const vendorId = vendorIds.get(po.vendor);
    if (!vendorId) throw new Error(`${po.poNumber} references unknown vendor "${po.vendor}"`);
    await prisma.purchaseOrder.create({
      data: {
        poNumber: po.poNumber,
        vendorId,
        currency: po.currency,
        totalMinor: po.lines.reduce((sum, l) => sum + l.quantity * l.unitPriceMinor, 0),
        lines: { create: po.lines },
      },
    });
  }

  if (history && options.history) {
    const { storage, now = new Date() } = options.history;
    for (const entry of history.invoices) {
      const pdf = await readFile(join(options.fixturesDir, 'history', entry.file));
      const fileKey = `${HISTORY_FILE_PREFIX}${entry.file}`;
      await storage.save(fileKey, pdf);
      await prisma.$transaction((tx) => createHistoryInvoice(tx, entry, fileKey, now), {
        maxWait: 10_000,
        timeout: 30_000,
      });
    }
  }

  return {
    vendors: vendors.length,
    purchaseOrders: allPurchaseOrders.length,
    invoices: history?.invoices.length ?? 0,
  };
}

/**
 * Writes an invoice as if the pipeline (and, where the story says so, a reviewer) had already
 * handled it, so the dashboard opens with a believable history.
 */
async function createHistoryInvoice(
  tx: Prisma.TransactionClient,
  entry: HistoryInvoice,
  fileKey: string,
  now: Date,
): Promise<void> {
  const fields = entry.invoice;
  const { currency } = fields;
  const minor = (amount: string) => toMinor(amount, currency);
  const receivedAt = new Date(now.getTime() - entry.daysAgo * 24 * 3600 * 1000);
  const at = (seconds: number) => new Date(receivedAt.getTime() + seconds * 1000);
  const decidedAt = at(entry.processingSeconds);
  const reviewedAt = entry.review ? at(entry.review.afterHours * 3600) : null;

  const vendor = await tx.vendor.findFirstOrThrow({ where: { taxId: fields.vendorTaxId } });
  const po = fields.poNumber
    ? await tx.purchaseOrder.findUniqueOrThrow({ where: { poNumber: fields.poNumber } })
    : null;
  const status = entry.outcome;
  const confidence = entry.confidence;
  const { lineItems, ...header } = fields;

  const invoice = await tx.invoice.create({
    data: {
      vendorId: vendor.id,
      purchaseOrderId: po?.id ?? null,
      invoiceNumber: fields.invoiceNumber,
      issueDate: new Date(fields.issueDate),
      dueDate: fields.dueDate ? new Date(fields.dueDate) : null,
      currency,
      subtotalMinor: minor(fields.subtotal),
      taxMinor: minor(fields.tax),
      totalMinor: minor(fields.total),
      status,
      confidence,
      fileKey,
      createdAt: receivedAt,
      rawExtraction: {
        ...header,
        lineItems,
        confidence: {
          vendor: confidence,
          invoiceNumber: confidence,
          dates: confidence,
          currency: confidence,
          lineItems: confidence,
          totals: confidence,
        },
      },
      lines: {
        create: lineItems.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPriceMinor: minor(line.unitPrice),
          totalMinor: minor(line.total),
        })),
      },
      discrepancies: { create: entry.discrepancies },
    },
  });

  const blocking = entry.discrepancies.filter((d) => d.severity === 'BLOCKING').length;
  const warning = entry.discrepancies.filter((d) => d.severity === 'WARNING').length;
  const total = formatMinor(minor(fields.total), currency);
  const events: Prisma.AuditEventCreateManyInput[] = [
    {
      invoiceId: invoice.id,
      step: 'UPLOADED',
      actor: 'USER',
      createdAt: receivedAt,
      summary: `Uploaded ${entry.file}`,
      detail: { originalName: entry.file, seeded: true },
    },
    {
      invoiceId: invoice.id,
      step: 'EXTRACTED',
      actor: 'AGENT',
      createdAt: at(entry.processingSeconds - 2),
      summary: `Extracted ${fields.invoiceNumber} from ${fields.vendorName}: ${lineItems.length} lines, ${total} (confidence ${confidence.toFixed(2)})`,
      detail: { mode: 'text', confidence },
    },
    {
      invoiceId: invoice.id,
      step: 'MATCHED',
      actor: 'AGENT',
      createdAt: at(entry.processingSeconds - 1),
      summary: `Vendor: ${vendor.name} (by taxId). PO: ${po ? `${po.poNumber} (by poNumber)` : 'none'}.`,
    },
    {
      invoiceId: invoice.id,
      step: 'DECIDED',
      actor: 'AGENT',
      createdAt: decidedAt,
      summary:
        status === 'AUTO_APPROVED'
          ? 'Auto-approved: clean PO match and confidence above threshold.'
          : `Needs review: ${blocking} blocking, ${warning} warning.`,
      detail: {
        decision: status === 'AUTO_APPROVED' ? 'AUTO_APPROVED' : 'NEEDS_REVIEW',
        explanation: entry.explanation ?? null,
        explanationSource: entry.explanation ? 'llm' : null,
      },
    },
  ];
  if (entry.review && reviewedAt) {
    const { note, reason } = entry.review;
    events.push({
      invoiceId: invoice.id,
      step: 'REVIEWED',
      actor: 'USER',
      createdAt: reviewedAt,
      summary:
        status === 'REJECTED'
          ? `Rejected by reviewer: ${reason ?? ''}`
          : note
            ? `Approved by reviewer: ${note}`
            : 'Approved by reviewer',
      detail:
        status === 'REJECTED'
          ? { decision: 'REJECTED', reason: reason ?? null }
          : { decision: 'APPROVED', note: note ?? null },
    });
  }
  await tx.auditEvent.createMany({ data: events });

  if (status === 'REJECTED') return;
  const postedAt = reviewedAt ?? at(entry.processingSeconds + 1);
  const result = await new MockErpAdapter().postInvoice(
    {
      id: invoice.id,
      vendorId: vendor.id,
      purchaseOrderId: po?.id ?? null,
      currency,
      subtotalMinor: minor(fields.subtotal),
      totalMinor: minor(fields.total),
    },
    tx,
  );
  await tx.ledgerEntry.update({ where: { id: result.ledgerEntryId }, data: { postedAt } });
  await tx.auditEvent.create({
    data: {
      invoiceId: invoice.id,
      step: 'POSTED',
      actor: status === 'APPROVED' ? 'USER' : 'AGENT',
      createdAt: postedAt,
      summary: `Posted ${total} to account ${result.accountCode}`,
      detail: result,
    },
  });
}
