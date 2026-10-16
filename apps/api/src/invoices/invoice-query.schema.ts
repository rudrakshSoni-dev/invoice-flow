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
