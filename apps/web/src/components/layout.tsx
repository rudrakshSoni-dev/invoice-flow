import { type UseQueryResult, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Moon, ReceiptText, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { api, type Health } from '../lib/api';
import { cn } from '../lib/cn';
import { applyTheme, readTheme, type Theme } from '../lib/theme';
import { ResetDemoButton } from './reset-demo-button';
import { Button, focusRing } from './ui/button';

// The hosted API sleeps when idle and takes a while to wake, so keep checking for about a minute.
const HEALTH_RETRIES = 20;
const HEALTH_RETRY_DELAY_MS = 3_000;
const SLOW_START_MS = 3_000;

function useApiHealth() {
  const queryClient = useQueryClient();
  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => api.health(signal),
    retry: HEALTH_RETRIES,
    retryDelay: HEALTH_RETRY_DELAY_MS,
  });
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!health.isPending) return;
    const timer = setTimeout(() => setSlow(true), SLOW_START_MS);
    return () => clearTimeout(timer);
  }, [health.isPending]);

  // Once a slow start finishes, refetch whatever failed while the API was asleep.
  useEffect(() => {
    if (slow && health.isSuccess) {
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'health' });
    }
  }, [slow, health.isSuccess, queryClient]);

  return { health, waking: slow && health.isPending };
}

function WakingBanner() {
  return (
    <div role="status" className="border-b border-border bg-surface">
      <p className="mx-auto flex max-w-[1200px] items-center gap-2 px-4 py-2 text-sm text-text-muted">
        <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin" />
        Waking up the demo server. It sleeps when idle on a free tier, so the first load can take up
        to a minute.
      </p>
    </div>
  );
}

function ApiStatus({ health }: { health: UseQueryResult<Health> }) {
  const state = health.isPending ? 'checking' : health.isError ? 'unreachable' : 'healthy';
  const label = {
    checking: 'Checking API',
    healthy: 'API healthy',
    unreachable: 'API unreachable',
  }[state];
  return (
    <span
      role="status"
      className={cn(
        'inline-flex items-center gap-2 text-xs',
        state === 'healthy' && 'text-approved',
        state === 'unreachable' && 'text-failed',
        state === 'checking' && 'text-text-muted',
      )}
    >
      <span aria-hidden="true">{{ checking: '…', healthy: '●', unreachable: '✕' }[state]}</span>
      {label}
    </span>
  );
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-lg px-3 py-1.5 text-sm transition-colors duration-150',
    focusRing,
    isActive ? 'bg-border/60 text-text' : 'text-text-muted hover:text-text',
  );

export function Layout() {
  const { health, waking } = useApiHealth();
  const [theme, setTheme] = useState<Theme>(readTheme);
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-6 px-4">
          <NavLink
            to="/"
            className={cn('flex items-center gap-2 rounded font-semibold', focusRing)}
          >
            <ReceiptText aria-hidden="true" className="size-5 text-accent" />
            <h1 className="text-base">InvoiceFlow</h1>
          </NavLink>
          <nav aria-label="Main" className="flex gap-1">
            <NavLink to="/" end className={navClass}>
              Invoices
            </NavLink>
            <NavLink to="/ledger" className={navClass}>
              Ledger
            </NavLink>
          </nav>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? (
              <Sun aria-hidden="true" className="size-4" />
            ) : (
              <Moon aria-hidden="true" className="size-4" />
            )}
          </Button>
        </div>
      </header>
      {waking && <WakingBanner />}
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-xs text-text-muted">
          <span className="mr-auto">InvoiceFlow demo · AI agent for accounts payable</span>
          <ResetDemoButton />
          <ApiStatus health={health} />
        </div>
      </footer>
    </div>
  );
}
