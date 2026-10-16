import type { InvoiceDetail, InvoiceListItem, Stats } from '../lib/api';

export const emptyStats: Stats = {
  total: 0,
  processed: 0,
  needsReview: 0,
  autoApprovalRate: null,
  avgProcessingMs: null,
  byStatus: {
    PROCESSING: 0,
    AUTO_APPROVED: 0,
    NEEDS_REVIEW: 0,
    APPROVED: 0,
    REJECTED: 0,
    FAILED: 0,
  },
};

export const stats: Stats = {
  ...emptyStats,
  total: 2,
  processed: 2,
  needsReview: 1,
  autoApprovalRate: 0.5,
  avgProcessingMs: 4200,
  byStatus: { ...emptyStats.byStatus, AUTO_APPROVED: 1, NEEDS_REVIEW: 1 },
};

export const listItems: InvoiceListItem[] = [
  {
    id: 'inv-1',
    invoiceNumber: 'INV-A-2041',
    currency: 'USD',
    totalMinor: 149472,
    status: 'AUTO_APPROVED',
    confidence: 0.95,
    createdAt: new Date().toISOString(),
    vendor: { id: 'v-acme', name: 'Acme Office Supplies Inc.' },
    extractedVendorName: 'Acme Office Supplies Inc.',
  },
  {
    id: 'inv-2',
    invoiceNumber: 'ZCP-2026-114',
    currency: 'USD',
    totalMinor: 575000,
    status: 'NEEDS_REVIEW',
    confidence: 0.95,
    createdAt: new Date().toISOString(),
    vendor: null,
    extractedVendorName: 'Zenith Consulting Partners',
  },
];

export const reviewInvoice: InvoiceDetail = {
  id: 'inv-3',
  invoiceNumber: 'NWL-88213',
  currency: 'USD',
  subtotalMinor: 1197000,
  taxMinor: 0,
  totalMinor: 1197000,
  status: 'NEEDS_REVIEW',
  confidence: 0.95,
  createdAt: '2026-10-16T10:00:00.000Z',
  issueDate: '2026-09-10T00:00:00.000Z',
  dueDate: '2026-10-10T00:00:00.000Z',
  vendorId: 'v-nw',
  purchaseOrderId: 'po-2',
  vendor: { id: 'v-nw', name: 'Northwind Logistics LLC', taxId: 'US-27-5561902', email: null },
  rawExtraction: {
    vendorName: 'Northwind Logistics LLC',
    poNumber: 'PO-1002',
    confidence: {
      vendor: 0.98,
      invoiceNumber: 0.99,
      dates: 0.97,
      currency: 0.99,
      lineItems: 0.95,
      totals: 0.6,
    },
  },
  lines: [
    {
      id: 'l1',
      description: 'Freight, Chicago to Denver, full truckload',
      quantity: 4,
      unitPriceMinor: 299250,
      totalMinor: 1197000,
    },
  ],
  discrepancies: [
    {
      id: 'd1',
      type: 'AMOUNT_MISMATCH',
      severity: 'BLOCKING',
      message: 'Subtotal $11,970.00 is 5.0% over the $11,400.00 remaining on PO-1002.',
      expected: '<= $11,400.00',
      actual: '$11,970.00',
    },
  ],
  auditEvents: [
    {
      id: 'a1',
      step: 'UPLOADED',
      actor: 'USER',
      summary: 'Uploaded 02.pdf',
      detail: null,
      createdAt: '2026-10-16T10:00:00.000Z',
    },
    {
      id: 'a2',
      step: 'DECIDED',
      actor: 'AGENT',
      summary: 'Needs review: 1 blocking, 0 warning.',
      detail: {
        explanation:
          'The invoice is 5% over its purchase order. Confirm the extra freight cost first.',
      },
      createdAt: '2026-10-16T10:00:04.000Z',
    },
  ],
  purchaseOrder: {
    id: 'po-2',
    poNumber: 'PO-1002',
    vendorId: 'v-nw',
    currency: 'USD',
    totalMinor: 1140000,
    billedMinor: 0,
    status: 'OPEN',
    lines: [
      {
        id: 'pl1',
        description: 'Freight, Chicago to Denver, full truckload',
        quantity: 4,
        unitPriceMinor: 285000,
      },
    ],
  },
};
