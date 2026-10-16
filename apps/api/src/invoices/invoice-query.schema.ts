import { InvoiceStatus } from '@prisma/client';
import { z } from 'zod';

export const listInvoicesQuerySchema = z.object({
  status: z.enum(InvoiceStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;

export const approveInvoiceSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export const rejectInvoiceSchema = z.object({
  reason: z.string().trim().min(3, 'A rejection reason is required').max(500),
});

export type ApproveInvoiceInput = z.infer<typeof approveInvoiceSchema>;
export type RejectInvoiceInput = z.infer<typeof rejectInvoiceSchema>;

const decimalAmount = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Use a decimal amount such as "1234.50"');

/** Fields a reviewer may correct before approving. Amounts are decimal strings; the API converts them. */
export const updateInvoiceSchema = z
  .object({
    invoiceNumber: z.string().trim().min(1).max(100),
    issueDate: z.iso.date(),
    dueDate: z.iso.date().nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/, 'Use an ISO 4217 code such as "USD"'),
    subtotal: decimalAmount,
    tax: decimalAmount,
    total: decimalAmount,
    vendorId: z.uuid().nullable(),
    purchaseOrderId: z.uuid().nullable(),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');

export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
