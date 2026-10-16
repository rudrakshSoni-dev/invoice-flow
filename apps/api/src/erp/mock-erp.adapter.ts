import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { InvalidStateError } from '../common/domain-errors';
import type { ErpAdapter, PostableInvoice, PostingResult } from './erp-adapter';

/** Accounts payable expense account used for every posting in the demo ledger. */
export const DEFAULT_EXPENSE_ACCOUNT = '6000';

@Injectable()
export class MockErpAdapter implements ErpAdapter {
  async postInvoice(
    invoice: PostableInvoice,
    tx: Prisma.TransactionClient,
  ): Promise<PostingResult> {
    const existing = await tx.ledgerEntry.findFirst({
      where: { invoiceId: invoice.id },
      select: { id: true },
    });
    if (existing) throw new InvalidStateError(`Invoice ${invoice.id} is already posted`);

    const entry = await tx.ledgerEntry.create({
      data: {
        invoiceId: invoice.id,
        vendorId: invoice.vendorId,
        accountCode: DEFAULT_EXPENSE_ACCOUNT,
        amountMinor: invoice.totalMinor,
        currency: invoice.currency,
      },
    });

    if (invoice.purchaseOrderId) {
      // PO balances are pre-tax, so billing is tracked against the subtotal.
      const po = await tx.purchaseOrder.update({
        where: { id: invoice.purchaseOrderId },
        data: { billedMinor: { increment: invoice.subtotalMinor } },
      });
      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: { status: po.billedMinor >= po.totalMinor ? 'CLOSED' : 'PARTIALLY_BILLED' },
      });
    }

    return { ledgerEntryId: entry.id, accountCode: entry.accountCode };
  }
}
