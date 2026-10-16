import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { extractedInvoiceFieldsSchema, notAnInvoiceSchema } from '../src/agent/extraction.schema';

export const FIXTURE_DIR = join(__dirname, '../../../fixtures/invoices');

const manifestSchema = z.array(
  z.object({
    file: z.string(),
    scenario: z.string(),
    render: z
      .object({ scanned: z.boolean().optional(), garbage: z.array(z.string()).optional() })
      .optional(),
    expected: z.union([extractedInvoiceFieldsSchema, notAnInvoiceSchema.omit({ reason: true })]),
  }),
);

export type FixtureInvoice = z.infer<typeof manifestSchema>[number];

export function loadFixtureManifest(): FixtureInvoice[] {
  return manifestSchema.parse(JSON.parse(readFileSync(join(FIXTURE_DIR, 'manifest.json'), 'utf8')));
}
