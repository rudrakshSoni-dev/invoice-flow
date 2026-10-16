import type { Prisma } from '@prisma/client';

export type PostableInvoice = {
  id: string;
  vendorId: string;
  purchaseOrderId: string | null;
  currency: string;
  subtotalMinor: number;
  totalMinor: number;
};

export type PostingResult = { ledgerEntryId: string; accountCode: string };

/**
 * Seam for a real ERP. Posting runs inside the caller's database transaction so the invoice status
 * and the ledger never disagree. A remote ERP adapter would instead write an outbox row here and
 * deliver it asynchronously.
 */
export interface ErpAdapter {
  postInvoice(invoice: PostableInvoice, tx: Prisma.TransactionClient): Promise<PostingResult>;
}

export const ERP_ADAPTER = Symbol('ERP_ADAPTER');
