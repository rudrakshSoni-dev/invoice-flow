import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createBrowserRouter, type RouteObject, RouterProvider } from 'react-router';
import { Layout } from './components/layout';
import { ToastProvider } from './components/ui/toast';
import { TooltipProvider } from './components/ui/tooltip';
import { InvoiceEventsProvider } from './lib/invoice-events';
import { DashboardPage } from './pages/dashboard-page';
import { NotFoundPage } from './pages/not-found-page';

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    // Shown for the moment a deep link waits on its lazy route chunk.
    hydrateFallbackElement: <div className="min-h-screen bg-bg" aria-busy="true" />,
    children: [
      { index: true, element: <DashboardPage /> },
      // The review screen and ledger load on demand to keep the first page small.
      {
        path: 'invoices/:id',
        lazy: async () => ({
          Component: (await import('./pages/invoice-detail-page')).InvoiceDetailPage,
        }),
      },
      {
        path: 'ledger',
        lazy: async () => ({ Component: (await import('./pages/ledger-page')).LedgerPage }),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 5_000, refetchOnWindowFocus: true } },
  });
}

export function Providers({ client, children }: { client: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <InvoiceEventsProvider>
        <TooltipProvider>
          <ToastProvider>{children}</ToastProvider>
        </TooltipProvider>
      </InvoiceEventsProvider>
    </QueryClientProvider>
  );
}

const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL });
const queryClient = createQueryClient();

export function App() {
  return (
    <Providers client={queryClient}>
      <RouterProvider router={router} />
    </Providers>
  );
}
