import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createBrowserRouter, type RouteObject, RouterProvider } from 'react-router';
import { Layout } from './components/layout';
import { ToastProvider } from './components/ui/toast';
import { TooltipProvider } from './components/ui/tooltip';
import { InvoiceEventsProvider } from './lib/invoice-events';
import { DashboardPage } from './pages/dashboard-page';
import { InvoiceDetailPage } from './pages/invoice-detail-page';
import { LedgerPage } from './pages/ledger-page';
import { NotFoundPage } from './pages/not-found-page';

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'invoices/:id', element: <InvoiceDetailPage /> },
      { path: 'ledger', element: <LedgerPage /> },
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

const router = createBrowserRouter(routes);
const queryClient = createQueryClient();

export function App() {
  return (
    <Providers client={queryClient}>
      <RouterProvider router={router} />
    </Providers>
  );
}
