import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Card } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { Table, Td, Th } from '../components/ui/table';
import { focusRing } from '../components/ui/button';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { formatDateTime, formatMoney } from '../lib/format';

export function LedgerPage() {
  const ledger = useQuery({ queryKey: ['ledger'], queryFn: api.ledger });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Ledger</h2>
        <p className="text-sm text-text-muted">Entries posted to the mock ERP, newest first.</p>
      </div>
      <Card>
        {ledger.isPending ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : ledger.isError ? (
          <p className="p-4 text-sm text-failed">
            Could not load the ledger: {ledger.error.message}
          </p>
        ) : ledger.data.items.length === 0 ? (
          <p className="p-8 text-center text-sm text-text-muted">
            Nothing posted yet. Approved invoices appear here.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Posted</Th>
                <Th>Vendor</Th>
                <Th>Invoice</Th>
                <Th className="hidden sm:table-cell">Account</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {ledger.data.items.map((entry) => (
                <tr key={entry.id}>
                  <Td className="text-text-muted">{formatDateTime(entry.postedAt)}</Td>
                  <Td>{entry.vendor.name}</Td>
                  <Td className="amount text-xs">
                    <Link
                      to={`/invoices/${entry.invoice.id}`}
                      className={cn('rounded hover:underline', focusRing)}
                    >
                      {entry.invoice.invoiceNumber ?? entry.invoice.id.slice(0, 8)}
                    </Link>
                  </Td>
                  <Td className="amount hidden text-xs sm:table-cell">{entry.accountCode}</Td>
                  <Td className="amount text-right">
                    {formatMoney(entry.amountMinor, entry.currency)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
