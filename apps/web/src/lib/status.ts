import type { InvoiceStatus } from './api';

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  PROCESSING: 'Processing',
  AUTO_APPROVED: 'Auto-approved',
  NEEDS_REVIEW: 'Needs review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  FAILED: 'Failed',
};

export const STATUS_ORDER: InvoiceStatus[] = [
  'PROCESSING',
  'NEEDS_REVIEW',
  'AUTO_APPROVED',
  'APPROVED',
  'REJECTED',
  'FAILED',
];
