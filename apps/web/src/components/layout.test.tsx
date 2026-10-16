import { act, screen } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { emptyStats } from '../test/data';
import { mockApi, renderAt } from '../test/harness';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Holds /health requests until `wake()`, like an API host waking from sleep. */
function sleepingApi() {
  mockApi({
    'GET /health': { status: 'ok', database: 'up' },
    'GET /samples': [],
    'GET /stats': emptyStats,
    'GET /invoices': { items: [], total: 0, page: 1, pageSize: 100 },
  });
  const stub = globalThis.fetch;
  let wake = () => {};
  const awake = new Promise<void>((resolve) => (wake = resolve));
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/health')) await awake;
    return stub(input, init);
  });
  return { wake };
}

describe('Layout', () => {
  it('explains a slow first load while the API wakes, then clears', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { wake } = sleepingApi();
    renderAt('/');

    expect(screen.queryByText(/Waking up the demo server/)).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(screen.getByText(/Waking up the demo server/)).toBeInTheDocument();

    await act(async () => wake());
    expect(await screen.findByText('API healthy')).toBeInTheDocument();
    expect(screen.queryByText(/Waking up the demo server/)).not.toBeInTheDocument();
  });

  it('shows no banner when the API answers quickly', async () => {
    sleepingApi().wake();
    renderAt('/');

    expect(await screen.findByText('API healthy')).toBeInTheDocument();
    expect(screen.queryByText(/Waking up the demo server/)).not.toBeInTheDocument();
  });
});
