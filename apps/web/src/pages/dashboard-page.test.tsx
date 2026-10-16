import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, vi } from 'vitest';
import { emptyStats, listItems, stats } from '../test/data';
import { mockApi, renderAt } from '../test/harness';

afterEach(() => vi.unstubAllGlobals());

const base = { 'GET /health': { status: 'ok', database: 'up' }, 'GET /samples': [] };

describe('Dashboard', () => {
  it('shows one sentence and the sample button when there are no invoices', async () => {
    mockApi({
      ...base,
      'GET /stats': emptyStats,
      'GET /invoices': { items: [], total: 0, page: 1, pageSize: 100 },
    });
    renderAt('/');

    expect(await screen.findByText(/No invoices yet/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Try a sample invoice/ })).toHaveLength(2);
  });

  it('lists invoices with stats and labelled statuses', async () => {
    mockApi({
      ...base,
      'GET /stats': stats,
      'GET /invoices': { items: listItems, total: 2, page: 1, pageSize: 100 },
    });
    renderAt('/');

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]!).getByText('Acme Office Supplies Inc.')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Auto-approved')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Zenith Consulting Partners')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Needs review')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('4.2 s')).toBeInTheDocument();
  });

  it('filters by status', async () => {
    const api = mockApi({
      ...base,
      'GET /stats': stats,
      'GET /invoices': (_: unknown, url: URL) => ({
        items: listItems.filter(
          (i) => !url.searchParams.get('status') || i.status === url.searchParams.get('status'),
        ),
        total: 1,
        page: 1,
        pageSize: 100,
      }),
    });
    renderAt('/');
    await screen.findByRole('table');

    await userEvent.click(screen.getByRole('button', { name: /^Needs review/ }));
    expect(
      await screen.findByRole('button', { name: /^Needs review/, pressed: true }),
    ).toBeInTheDocument();
    expect(
      api.calls.some((c) => c.path === '/invoices' && c.search.includes('status=NEEDS_REVIEW')),
    ).toBe(true);
    await vi.waitFor(() =>
      expect(screen.queryByText('Acme Office Supplies Inc.')).not.toBeInTheDocument(),
    );
  });

  it('reports an unreachable API with text, not only color, once it stops retrying', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockApi({
      'GET /health': new Response(null, { status: 503 }),
      'GET /stats': emptyStats,
      'GET /invoices': { items: [], total: 0, page: 1, pageSize: 100 },
      'GET /samples': [],
    });
    renderAt('/');
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(screen.getByText(/Waking up the demo server/)).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(await screen.findByText('API unreachable')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('resets the demo data after confirmation', async () => {
    const api = mockApi({
      ...base,
      'GET /stats': stats,
      'GET /invoices': { items: listItems, total: listItems.length, page: 1, pageSize: 100 },
      'POST /demo/reset': { vendors: 6, purchaseOrders: 12, invoices: 6 },
    });
    renderAt('/');

    await userEvent.click(await screen.findByRole('button', { name: /Reset demo data/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Reset demo data?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reset' }));

    expect(await screen.findByText('Demo data reset')).toBeInTheDocument();
    expect(api.calls.filter((c) => c.path === '/demo/reset')).toHaveLength(1);
  });
});
