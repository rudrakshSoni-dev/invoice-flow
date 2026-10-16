export type InvoiceStatus =
  'PROCESSING' | 'AUTO_APPROVED' | 'NEEDS_REVIEW' | 'APPROVED' | 'REJECTED' | 'FAILED';
export type Severity = 'INFO' | 'WARNING' | 'BLOCKING';
export type PipelineStage = 'EXTRACT' | 'MATCH' | 'CHECK' | 'POST';

export type VendorRef = { id: string; name: string };
export type Vendor = VendorRef & { taxId: string | null; email: string | null };

export type InvoiceListItem = {
  id: string;
  invoiceNumber: string | null;
  currency: string | null;
  totalMinor: number | null;
  status: InvoiceStatus;
  confidence: number | null;
  createdAt: string;
  vendor: VendorRef | null;
  extractedVendorName: string | null;
};

export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

export type FieldConfidence = {
  vendor: number;
  invoiceNumber: number;
  dates: number;
  currency: number;
  lineItems: number;
  totals: number;
};

export type RawExtraction = {
  vendorName?: string;
  vendorTaxId?: string | null;
  poNumber?: string | null;
  confidence?: FieldConfidence;
  reason?: string;
  error?: string;
  rawOutputs?: string[];
};

export type InvoiceLine = {
  id: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  totalMinor: number;
};
export type PurchaseOrderLine = {
  id: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
};

export type PurchaseOrder = {
  id: string;
  poNumber: string;
  vendorId: string;
  currency: string;
  totalMinor: number;
  billedMinor: number;
  status: 'OPEN' | 'PARTIALLY_BILLED' | 'CLOSED';
  lines: PurchaseOrderLine[];
};

export type PurchaseOrderListItem = PurchaseOrder & { vendor: VendorRef; remainingMinor: number };

export type Discrepancy = {
  id: string;
  type: string;
  severity: Severity;
  message: string;
  expected: string | null;
  actual: string | null;
};

export type AuditEvent = {
  id: string;
  step: 'UPLOADED' | 'EXTRACTED' | 'MATCHED' | 'DECIDED' | 'REVIEWED' | 'POSTED';
  actor: 'AGENT' | 'USER';
  summary: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

export type InvoiceDetail = Omit<InvoiceListItem, 'extractedVendorName'> & {
  vendorId: string | null;
  purchaseOrderId: string | null;
  issueDate: string | null;
  dueDate: string | null;
  subtotalMinor: number | null;
  taxMinor: number | null;
  vendor: Vendor | null;
  rawExtraction: RawExtraction | null;
  lines: InvoiceLine[];
  discrepancies: Discrepancy[];
  auditEvents: AuditEvent[];
  purchaseOrder: PurchaseOrder | null;
};

export type InvoiceUpdate = Partial<{
  invoiceNumber: string;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  subtotal: string;
  tax: string;
  total: string;
  vendorId: string | null;
}>;

export type Stats = {
  total: number;
  processed: number;
  needsReview: number;
  autoApprovalRate: number | null;
  avgProcessingMs: number | null;
  byStatus: Record<InvoiceStatus, number>;
};

export type Sample = { id: string; file: string; scenario: string };

export type LedgerEntry = {
  id: string;
  accountCode: string;
  amountMinor: number;
  currency: string;
  postedAt: string;
  vendor: VendorRef;
  invoice: { id: string; invoiceNumber: string | null };
};

export type Health = { status: 'ok'; database: 'up' };

export const API_BASE: string = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(response.status, body?.message ?? `Request failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  health: (signal?: AbortSignal) => request<Health>('/health', { signal }),
  stats: () => request<Stats>('/stats'),
  invoices: (status?: InvoiceStatus) =>
    request<Page<InvoiceListItem>>(`/invoices?pageSize=100${status ? `&status=${status}` : ''}`),
  invoice: (id: string) => request<InvoiceDetail>(`/invoices/${id}`),
  invoiceFileUrl: (id: string) => `${API_BASE}/invoices/${id}/file`,
  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ id: string; status: InvoiceStatus }>('/invoices', {
      method: 'POST',
      body: form,
    });
  },
  samples: () => request<Sample[]>('/samples'),
  uploadSample: (id: string) =>
    request<{ id: string; status: InvoiceStatus }>(`/samples/${id}`, { method: 'POST' }),
  update: (id: string, update: InvoiceUpdate) =>
    request<InvoiceDetail>(`/invoices/${id}`, json('PATCH', update)),
  approve: (id: string, note?: string) =>
    request<InvoiceDetail>(`/invoices/${id}/approve`, json('POST', { note })),
  reject: (id: string, reason: string) =>
    request<InvoiceDetail>(`/invoices/${id}/reject`, json('POST', { reason })),
  vendors: () => request<Vendor[]>('/vendors'),
  ledger: () => request<Page<LedgerEntry>>('/ledger'),
};
