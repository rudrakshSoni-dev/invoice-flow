import { InvoiceStatus } from '@prisma/client';
import { z } from 'zod';

export const listInvoicesQuerySchema = z.object({
  status: z.enum(InvoiceStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
