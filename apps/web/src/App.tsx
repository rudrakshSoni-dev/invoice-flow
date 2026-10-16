import { ApiStatus } from './components/ApiStatus';

export function App() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-4">
          <h1 className="text-base font-semibold">InvoiceFlow</h1>
          <ApiStatus />
        </div>
      </header>
      <main className="mx-auto max-w-[1200px] px-4 py-8">
        <p className="text-text-muted">
          Invoices are read, matched against purchase orders, and posted to the ledger by an AI
          agent.
        </p>
      </main>
    </div>
  );
}
