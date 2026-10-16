import { useNavigate } from 'react-router';
import type { InvoiceListItem } from '../lib/api';
import { cn } from '../lib/cn';
import { formatMoney, formatRelative } from '../lib/format';
import { useLiveInvoices } from '../lib/invoice-events';
import { Confidence } from './confidence';
import { STAGES } from './stage-stepper';
import { StatusBadge } from './status-badge';
import { Table, Td, Th } from './ui/table';

export function InvoiceTable({ invoices }: { invoices: InvoiceListItem[] }) {
  const navigate = useNavigate();
  const live = useLiveInvoices();

  return (
    <Table>
      <thead>
        <tr>
          <Th>Vendor</Th>
          <Th className="hidden sm:table-cell">Invoice</Th>
          <Th className="hidden text-right sm:table-cell">Amount</Th>
          <Th>Status</Th>
          <Th className="hidden md:table-cell">Confidence</Th>
          <Th className="hidden sm:table-cell">Received</Th>
        </tr>
      </thead>
      <tbody>
        {invoices.map((invoice) => {
          const stage = invoice.status === 'PROCESSING' ? live.stageOf(invoice.id) : undefined;
          const vendorName = invoice.vendor?.name ?? invoice.extractedVendorName;
          return (
            <tr
              key={invoice.id}
              onClick={() => navigate(`/invoices/${invoice.id}`)}
              className={cn(
                'cursor-pointer transition-colors duration-150 hover:bg-border/30',
                live.isFlashing(invoice.id) && 'animate-[row-flash_1500ms_ease-out]',
              )}
            >
              <Td className="max-w-40 truncate py-1 sm:max-w-56">
                <a
                  href={`/invoices/${invoice.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(`/invoices/${invoice.id}`);
                  }}
                  className="rounded hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {vendorName ?? (
                    <span className="text-text-muted">
                      {invoice.status === 'FAILED' ? 'Unreadable document' : 'Reading…'}
                    </span>
                  )}
                </a>
                {!invoice.vendor && invoice.extractedVendorName && (
                  <span className="ml-2 hidden text-xs text-review md:inline">unknown vendor</span>
                )}
                {invoice.invoiceNumber && (
                  <span className="amount mt-0.5 block text-xs text-text-muted sm:hidden">
                    {invoice.invoiceNumber} · {formatMoney(invoice.totalMinor, invoice.currency)}
                  </span>
                )}
              </Td>
              <Td className="amount hidden whitespace-nowrap text-xs sm:table-cell">
                {invoice.invoiceNumber ?? '—'}
              </Td>
              <Td className="amount hidden whitespace-nowrap text-right sm:table-cell">
                {formatMoney(invoice.totalMinor, invoice.currency)}
              </Td>
              <Td>
                <StatusBadge
                  status={invoice.status}
                  detail={stage ? STAGES.find((s) => s.id === stage)?.label : undefined}
                />
              </Td>
              <Td className="hidden md:table-cell">
                <Confidence value={invoice.confidence} />
              </Td>
              <Td className="hidden text-text-muted sm:table-cell">
                {formatRelative(invoice.createdAt)}
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
