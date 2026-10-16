import type { DraftDiscrepancy } from './discrepancy';
import { nameSimilarity, normalizeCode } from './text-similarity';

/** Minimum token similarity for a fuzzy vendor-name match. */
export const VENDOR_NAME_THRESHOLD = 0.75;

export type VendorCandidate = { id: string; name: string; taxId: string | null };
export type VendorMatch = { vendor: VendorCandidate; method: 'taxId' | 'name'; score: number };

export type PurchaseOrderCandidate = {
  id: string;
  poNumber: string;
  vendorId: string;
  currency: string;
  totalMinor: number;
  billedMinor: number;
  status: 'OPEN' | 'PARTIALLY_BILLED' | 'CLOSED';
  lines: Array<{ id: string; description: string; quantity: number; unitPriceMinor: number }>;
};
export type PurchaseOrderMatch = {
  purchaseOrder: PurchaseOrderCandidate;
  method: 'poNumber' | 'amount';
};

export function matchVendor(
  extracted: { vendorName: string; vendorTaxId: string | null },
  vendors: VendorCandidate[],
): VendorMatch | null {
  if (extracted.vendorTaxId) {
    const taxId = normalizeCode(extracted.vendorTaxId);
    const byTaxId = vendors.find((v) => v.taxId !== null && normalizeCode(v.taxId) === taxId);
    if (byTaxId) return { vendor: byTaxId, method: 'taxId', score: 1 };
  }

  let best: VendorMatch | null = null;
  for (const vendor of vendors) {
    const score = nameSimilarity(extracted.vendorName, vendor.name);
    if (score >= VENDOR_NAME_THRESHOLD && (!best || score > best.score)) {
      best = { vendor, method: 'name', score };
    }
  }
  return best;
}

export const remainingMinor = (po: PurchaseOrderCandidate) => po.totalMinor - po.billedMinor;

/**
 * Prefers the PO number printed on the invoice; otherwise the vendor's open PO whose remaining
 * balance is closest to the invoice subtotal.
 */
export function matchPurchaseOrder(input: {
  poNumber: string | null;
  vendorId: string | null;
  subtotalMinor: number;
  byNumber: PurchaseOrderCandidate | null;
  vendorOpenPurchaseOrders: PurchaseOrderCandidate[];
}): { match: PurchaseOrderMatch | null; discrepancies: DraftDiscrepancy[] } {
  const discrepancies: DraftDiscrepancy[] = [];

  if (input.poNumber && input.byNumber) {
    if (input.vendorId && input.byNumber.vendorId !== input.vendorId) {
      discrepancies.push({
        type: 'NO_MATCHING_PO',
        severity: 'BLOCKING',
        message: `Invoice references ${input.byNumber.poNumber}, which belongs to a different vendor.`,
        expected: 'PO issued to this vendor',
        actual: input.byNumber.poNumber,
      });
      return { match: null, discrepancies };
    }
    return { match: { purchaseOrder: input.byNumber, method: 'poNumber' }, discrepancies };
  }

  if (input.poNumber) {
    discrepancies.push({
      type: 'NO_MATCHING_PO',
      severity: 'WARNING',
      message: `Invoice references ${input.poNumber}, which does not exist.`,
      actual: input.poNumber,
    });
  }

  const [closest] = [...input.vendorOpenPurchaseOrders].sort(
    (a, b) =>
      Math.abs(remainingMinor(a) - input.subtotalMinor) -
      Math.abs(remainingMinor(b) - input.subtotalMinor),
  );
  if (closest) {
    discrepancies.push({
      type: 'NO_MATCHING_PO',
      severity: 'INFO',
      message: `No usable PO number on the invoice; matched ${closest.poNumber} by vendor and amount.`,
      actual: closest.poNumber,
    });
    return { match: { purchaseOrder: closest, method: 'amount' }, discrepancies };
  }

  discrepancies.push({
    type: 'NO_MATCHING_PO',
    severity: 'WARNING',
    message: input.vendorId
      ? 'No open purchase order found for this vendor.'
      : 'No purchase order found: the invoice has no PO number and the vendor is unknown.',
  });
  return { match: null, discrepancies };
}

export function unknownVendorDiscrepancy(
  vendorName: string,
  vendorTaxId: string | null,
): DraftDiscrepancy {
  return {
    type: 'UNKNOWN_VENDOR',
    severity: 'BLOCKING',
    message: `"${vendorName}" does not match any vendor on file.`,
    actual: vendorTaxId ? `${vendorName} (${vendorTaxId})` : vendorName,
  };
}

export function duplicateInvoiceDiscrepancy(
  invoiceNumber: string,
  vendorName: string,
): DraftDiscrepancy {
  return {
    type: 'DUPLICATE_INVOICE',
    severity: 'BLOCKING',
    message: `Invoice ${invoiceNumber} from ${vendorName} has already been received.`,
    actual: invoiceNumber,
  };
}
