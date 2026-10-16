import { type PurchaseOrderCandidate, matchPurchaseOrder, matchVendor } from './match.stage';

const vendors = [
  { id: 'v-acme', name: 'Acme Office Supplies Inc.', taxId: 'US-84-1029384' },
  { id: 'v-northwind', name: 'Northwind Logistics LLC', taxId: 'US-27-5561902' },
];

function po(overrides: Partial<PurchaseOrderCandidate>): PurchaseOrderCandidate {
  return {
    id: 'po-1',
    poNumber: 'PO-1',
    vendorId: 'v-acme',
    currency: 'USD',
    totalMinor: 100000,
    billedMinor: 0,
    status: 'OPEN',
    lines: [],
    ...overrides,
  };
}

describe('matchVendor', () => {
  it('matches by tax ID even when the name differs', () => {
    expect(
      matchVendor({ vendorName: 'ACME Corp', vendorTaxId: 'us 84 1029384' }, vendors),
    ).toMatchObject({
      vendor: { id: 'v-acme' },
      method: 'taxId',
    });
  });

  it('falls back to a fuzzy name match', () => {
    expect(
      matchVendor({ vendorName: 'NORTHWIND LOGISTICS', vendorTaxId: null }, vendors),
    ).toMatchObject({
      vendor: { id: 'v-northwind' },
      method: 'name',
      score: 1,
    });
  });

  it('returns null for an unknown vendor', () => {
    expect(
      matchVendor(
        { vendorName: 'Zenith Consulting Partners', vendorTaxId: 'US-55-4410298' },
        vendors,
      ),
    ).toBeNull();
  });
});

describe('matchPurchaseOrder', () => {
  const base = {
    vendorId: 'v-acme',
    subtotalMinor: 50000,
    byNumber: null,
    vendorOpenPurchaseOrders: [],
  };

  it('uses the PO number printed on the invoice', () => {
    const printed = po({ poNumber: 'PO-7' });
    const result = matchPurchaseOrder({ ...base, poNumber: 'PO-7', byNumber: printed });
    expect(result).toEqual({
      match: { purchaseOrder: printed, method: 'poNumber' },
      discrepancies: [],
    });
  });

  it('blocks a PO number that belongs to another vendor', () => {
    const result = matchPurchaseOrder({
      ...base,
      poNumber: 'PO-7',
      byNumber: po({ vendorId: 'v-northwind' }),
    });
    expect(result.match).toBeNull();
    expect(result.discrepancies).toMatchObject([{ type: 'NO_MATCHING_PO', severity: 'BLOCKING' }]);
  });

  it('picks the open PO whose remaining balance is closest to the subtotal', () => {
    const far = po({ id: 'far', poNumber: 'PO-FAR', totalMinor: 900000 });
    const close = po({ id: 'close', poNumber: 'PO-CLOSE', totalMinor: 80000, billedMinor: 30000 });
    const result = matchPurchaseOrder({
      ...base,
      poNumber: null,
      vendorOpenPurchaseOrders: [far, close],
    });
    expect(result.match).toEqual({ purchaseOrder: close, method: 'amount' });
    expect(result.discrepancies).toMatchObject([{ type: 'NO_MATCHING_PO', severity: 'INFO' }]);
  });

  it('warns about a printed PO number that does not exist, then falls back', () => {
    const open = po({});
    const result = matchPurchaseOrder({
      ...base,
      poNumber: 'PO-404',
      vendorOpenPurchaseOrders: [open],
    });
    expect(result.match?.method).toBe('amount');
    expect(result.discrepancies.map((d) => d.severity)).toEqual(['WARNING', 'INFO']);
  });

  it('reports no matching PO when nothing fits', () => {
    const result = matchPurchaseOrder({ ...base, vendorId: null, poNumber: null });
    expect(result).toMatchObject({
      match: null,
      discrepancies: [{ type: 'NO_MATCHING_PO', severity: 'WARNING' }],
    });
  });
});
