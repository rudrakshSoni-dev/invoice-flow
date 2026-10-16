import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const SEED_DIR = join(__dirname, '../../../fixtures/seed');

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

function readFixture<T>(file: string, schema: z.ZodType<T>): T {
  return schema.parse(JSON.parse(readFileSync(join(SEED_DIR, file), 'utf8')));
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const vendors = readFixture('vendors.json', vendorsSchema);
  const purchaseOrders = readFixture('purchase-orders.json', purchaseOrdersSchema);

  try {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Job", "AgentRun", "LedgerEntry", "AuditEvent", "Discrepancy", "InvoiceLine", "Invoice", "PurchaseOrderLine", "PurchaseOrder", "Vendor" CASCADE',
    );

    const vendorIds = new Map<string, string>();
    for (const { key, ...vendor } of vendors) {
      const created = await prisma.vendor.create({ data: vendor });
      vendorIds.set(key, created.id);
    }

    for (const po of purchaseOrders) {
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

    console.log(`Seeded ${vendors.length} vendors and ${purchaseOrders.length} purchase orders.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
