import { z } from 'zod';

const decimalAmount = z
  .string()
  .regex(
    /^-?\d+(\.\d{1,2})?$/,
    'Use a plain decimal string such as "1234.50" (no symbols or commas)',
  );
const confidence = z.number().min(0).max(1);

export const extractedLineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: decimalAmount,
  total: decimalAmount,
});

export const extractedInvoiceFieldsSchema = z.object({
  isInvoice: z.literal(true),
  vendorName: z.string().min(1),
  vendorTaxId: z.string().min(1).nullable(),
  invoiceNumber: z.string().min(1),
  poNumber: z.string().min(1).nullable(),
  issueDate: z.iso.date(),
  dueDate: z.iso.date().nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Use an ISO 4217 code such as "USD"'),
  lineItems: z.array(extractedLineSchema).min(1),
  subtotal: decimalAmount,
  tax: decimalAmount,
  total: decimalAmount,
});

export const fieldConfidenceSchema = z.object({
  vendor: confidence,
  invoiceNumber: confidence,
  dates: confidence,
  currency: confidence,
  lineItems: confidence,
  totals: confidence,
});

export const notAnInvoiceSchema = z.object({
  isInvoice: z.literal(false),
  reason: z.string().min(1),
});

/** Exactly what the LLM must return. Treated as untrusted until it parses. */
export const llmExtractionSchema = z.discriminatedUnion('isInvoice', [
  extractedInvoiceFieldsSchema.extend({ confidence: fieldConfidenceSchema }),
  notAnInvoiceSchema,
]);

export type ExtractedInvoiceFields = z.infer<typeof extractedInvoiceFieldsSchema>;
export type FieldConfidence = z.infer<typeof fieldConfidenceSchema>;
export type LlmExtraction = z.infer<typeof llmExtractionSchema>;
