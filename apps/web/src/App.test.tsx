import { render, screen } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { App } from './App';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('App shell', () => {
  it('shows the product name and a healthy API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ status: 'ok', database: 'up' })),
    );
    render(<App />);
    expect(screen.getByRole('heading', { name: 'InvoiceFlow' })).toBeInTheDocument();
    expect(await screen.findByText('API healthy')).toBeInTheDocument();
  });

  it('reports an unreachable API with text, not only color', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    render(<App />);
    expect(await screen.findByText('API unreachable')).toBeInTheDocument();
  });
});
