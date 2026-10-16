import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, vi } from 'vitest';
import { reviewInvoice } from '../test/data';
import { mockApi, renderAt } from '../test/harness';

afterEach(() => vi.unstubAllGlobals());

const routes = {
  'GET /health': { status: 'ok', database: 'up' },
  'GET /invoices/inv-3': reviewInvoice,
  'GET /vendors': [{ id: 'v-nw', name: 'Northwind Logistics LLC', taxId: null, email: null }],
};

describe('Invoice detail', () => {
  it('shows the discrepancy, the agent explanation, and low-confidence fields', async () => {
    mockApi(routes);
    renderAt('/invoices/inv-3');

    expect(await screen.findByText(/5.0% over the \$11,400.00 remaining/)).toBeInTheDocument();
    expect(screen.getByText(/Confirm the extra freight cost first/)).toBeInTheDocument();
    expect(screen.getByText('Blocking')).toBeInTheDocument();
    expect(screen.getAllByText(/Low · 0.60/)).toHaveLength(3);
    expect(screen.getByText('Audit trail (2)')).toBeInTheDocument();
  });

  it('requires a reason before rejecting', async () => {
    const api = mockApi({
      ...routes,
      'POST /invoices/inv-3/reject': { ...reviewInvoice, status: 'REJECTED' },
    });
    renderAt('/invoices/inv-3');
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }));

    const submit = screen.getByRole('button', { name: 'Reject invoice' });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Reason (required)'), 'Vendor must reissue');
    await userEvent.click(submit);

    expect(await screen.findByText('Invoice rejected')).toBeInTheDocument();
    expect(api.calls.find((c) => c.method === 'POST')).toMatchObject({
      path: '/invoices/inv-3/reject',
      body: { reason: 'Vendor must reissue' },
    });
  });

  it('saves edits before approving', async () => {
    const api = mockApi({
      ...routes,
      'PATCH /invoices/inv-3': { ...reviewInvoice, totalMinor: 1140000 },
      'POST /invoices/inv-3/approve': { ...reviewInvoice, totalMinor: 1140000, status: 'APPROVED' },
    });
    renderAt('/invoices/inv-3');

    const total = await screen.findByLabelText('Total');
    await userEvent.clear(total);
    await userEvent.type(total, '11400.00');
    expect(screen.getByText('You have unsaved edits.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await userEvent.type(screen.getByLabelText('Note (optional)'), 'Agreed surcharge');
    await userEvent.click(screen.getByRole('dialog').querySelector('button[type="submit"]')!);

    expect(await screen.findByText('Invoice approved')).toBeInTheDocument();
    const writes = api.calls.filter((c) => c.method !== 'GET');
    expect(writes).toEqual([
      expect.objectContaining({
        method: 'PATCH',
        path: '/invoices/inv-3',
        body: { total: '11400.00' },
      }),
      expect.objectContaining({
        method: 'POST',
        path: '/invoices/inv-3/approve',
        body: { note: 'Agreed surcharge' },
      }),
    ]);
  });

  it('retries a failed invoice', async () => {
    const failed = {
      ...reviewInvoice,
      status: 'FAILED' as const,
      invoiceNumber: null,
      rawExtraction: { error: 'Gemini returned 503' },
    };
    const api = mockApi({
      ...routes,
      'GET /invoices/inv-3': failed,
      'POST /invoices/inv-3/retry': { ...failed, status: 'PROCESSING', rawExtraction: null },
    });
    renderAt('/invoices/inv-3');

    expect(await screen.findByText(/Gemini returned 503/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('The agent is working on this invoice.')).toBeInTheDocument();
    expect(api.calls.some((c) => c.method === 'POST' && c.path === '/invoices/inv-3/retry')).toBe(
      true,
    );
  });

  it('shows a not-found message for an unknown invoice', async () => {
    mockApi({ 'GET /health': { status: 'ok', database: 'up' } });
    renderAt('/invoices/nope');
    expect(await screen.findByText(/This invoice does not exist/)).toBeInTheDocument();
  });
});
