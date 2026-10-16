import { useQuery } from '@tanstack/react-query';
import { Moon, ReceiptText, Sun } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { applyTheme, readTheme, type Theme } from '../lib/theme';
import { Button, focusRing } from './ui/button';

function ApiStatus() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => api.health(signal),
    retry: false,
  });
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
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-3 text-xs text-text-muted">
          <span>InvoiceFlow demo · AI agent for accounts payable</span>
          <ApiStatus />
        </div>
      </footer>
    </div>
  );
}
