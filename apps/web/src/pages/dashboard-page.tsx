import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { InvoiceTable } from '../components/invoice-table';
import { StatCards } from '../components/stat-cards';
import { Card } from '../components/ui/card';
import { ErrorState } from '../components/error-state';
import { Skeleton } from '../components/ui/skeleton';
import { focusRing } from '../components/ui/button';
import { UploadActions } from '../components/upload-actions';
import { api, type InvoiceStatus } from '../lib/api';
import { cn } from '../lib/cn';
import { STATUS_LABEL, STATUS_ORDER } from '../lib/status';

export function DashboardPage() {
  const [filter, setFilter] = useState<InvoiceStatus | undefined>();
  const stats = useQuery({ queryKey: ['stats'], queryFn: api.stats });
  const invoices = useQuery({
    queryKey: ['invoices', filter ?? 'all'],
    queryFn: () => api.invoices(filter),
    // Fallback for missed live events: poll while anything is still processing.
    refetchInterval: (query) =>
      query.state.data?.items.some((i) => i.status === 'PROCESSING') ? 3000 : false,
  });

  const isEmpty = stats.data?.total === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Invoices</h2>
          <p className="text-sm text-text-muted">
            The agent extracts, matches against purchase orders, and posts clean invoices
            automatically.
          </p>
        </div>
        <UploadActions />
      </div>

      <StatCards stats={stats.data} failed={stats.isError} />

      {isEmpty ? (
        <Card className="flex flex-col items-center gap-4 px-4 py-16 text-center">
          <p className="text-sm text-text-muted">
            No invoices yet. Upload a PDF or try one of the sample invoices.
          </p>
          <UploadActions samplesOnly />
        </Card>
      ) : (
        <Card>
          <div
            className="flex flex-wrap gap-2 border-b border-border p-3"
            role="group"
            aria-label="Filter by status"
          >
            {[undefined, ...STATUS_ORDER].map((status) => {
              const active = filter === status;
              const count = status ? stats.data?.byStatus[status] : stats.data?.total;
              return (
                <button
                  key={status ?? 'all'}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(status)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-colors duration-150',
                    focusRing,
                    active
                      ? 'border-accent bg-accent/15 text-text'
                      : 'border-border text-text-muted hover:text-text',
                  )}
                >
                  {status ? STATUS_LABEL[status] : 'All'}
                  {count !== undefined && <span className="amount ml-1.5 opacity-70">{count}</span>}
                </button>
              );
            })}
          </div>
          {invoices.isPending ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : invoices.isError ? (
            <ErrorState
              message={`Could not load invoices: ${invoices.error.message}`}
              onRetry={() => void invoices.refetch()}
            />
          ) : invoices.data.items.length === 0 ? (
            <p className="p-8 text-center text-sm text-text-muted">No invoices with this status.</p>
          ) : (
            <InvoiceTable invoices={invoices.data.items} />
          )}
        </Card>
      )}
    </div>
  );
}
