import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { Providers, routes } from '../App';

type Handler = (body: unknown, url: URL) => unknown;
export type Routes = Record<string, Handler | unknown>;

/** Stubs fetch with `"METHOD /path"` handlers (query string ignored) and records every call. */
export function mockApi(table: Routes) {
  const calls: Array<{ method: string; path: string; search: string; body: unknown }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const path = url.pathname.replace(/^\/api/, '');
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
    calls.push({ method, path, search: url.search, body });
    const key = `${method} ${path}`;
    if (!(key in table))
      return Response.json({ error: 'NOT_FOUND', message: `No mock for ${key}` }, { status: 404 });
    const handler = table[key];
    const result = typeof handler === 'function' ? (handler as Handler)(body, url) : handler;
    return result instanceof Response ? result : Response.json(result);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls };
}

export function renderAt(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <Providers client={client}>
      <RouterProvider router={router} />
    </Providers>,
  );
}
