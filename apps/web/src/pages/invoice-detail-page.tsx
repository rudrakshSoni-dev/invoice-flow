import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CircleX, ExternalLink } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { AuditTrail } from '../components/audit-trail';
import { Confidence } from '../components/confidence';
import { DiscrepancyList } from '../components/discrepancy-list';
import { InvoiceFieldsForm, useInvoiceForm } from '../components/invoice-fields-form';
import { PoComparison } from '../components/po-comparison';
import { ReviewActions } from '../components/review-actions';
import { StageStepper } from '../components/stage-stepper';
import { StatusBadge } from '../components/status-badge';
import { focusRing } from '../components/ui/button';
import { Card, CardBody, CardHeader } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { ApiError, api, type InvoiceDetail } from '../lib/api';
import { cn } from '../lib/cn';
import { formatMoney } from '../lib/format';
import { useLiveInvoices } from '../lib/invoice-events';

export function InvoiceDetailPage() {
  const { id = '' } = useParams();
  const invoice = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.invoice(id),
    refetchInterval: (query) => (query.state.data?.status === 'PROCESSING' ? 3000 : false),
  });

  return (
    <div className="space-y-4">
      <Link
        to="/"
        className={cn(
          'inline-flex items-center gap-1 rounded text-sm text-text-muted hover:text-text',
          focusRing,
        )}
      >
        <ArrowLeft aria-hidden="true" className="size-4" /> All invoices
      </Link>
      {invoice.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : invoice.isError ? (
        <Card className="p-6 text-sm">
          {invoice.error instanceof ApiError && invoice.error.status === 404
            ? 'This invoice does not exist.'
            : `Could not load the invoice: ${invoice.error.message}`}
        </Card>
      ) : (
        <InvoiceDetailView invoice={invoice.data} />
      )}
    </div>
  );
}

function InvoiceDetailView({ invoice }: { invoice: InvoiceDetail }) {
  const live = useLiveInvoices();
  const form = useInvoiceForm(invoice);
  const reviewable = invoice.status === 'NEEDS_REVIEW';
  const decided = invoice.auditEvents.find((e) => e.step === 'DECIDED');
  const explanation =
    typeof decided?.detail?.explanation === 'string' ? decided.detail.explanation : null;
  const vendorName = invoice.vendor?.name ?? invoice.rawExtraction?.vendorName ?? 'Unknown vendor';
  const fileUrl = api.invoiceFileUrl(invoice.id);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex flex-wrap items-center gap-3 text-xl font-semibold">
            <span className="amount">{invoice.invoiceNumber ?? 'New invoice'}</span>
            <StatusBadge status={invoice.status} />
          </h2>
          <p className="mt-1 text-sm text-text-muted">{vendorName}</p>
        </div>
        <div className="text-right">
          <p className="amount text-[28px] font-semibold leading-tight">
            {formatMoney(invoice.totalMinor, invoice.currency)}
          </p>
          <Confidence value={invoice.confidence} className="mt-1" />
        </div>
      </div>

      {invoice.status === 'PROCESSING' && (
        <Card>
          <CardBody className="space-y-3">
            <p className="text-sm text-text-muted">The agent is working on this invoice.</p>
            <StageStepper current={live.stageOf(invoice.id)} />
          </CardBody>
        </Card>
      )}

      {invoice.status === 'FAILED' && <FailurePanel invoice={invoice} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="hidden self-start overflow-hidden lg:sticky lg:top-4 lg:block">
          <CardHeader
            title="Original document"
            actions={
              <a
                href={fileUrl}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  'inline-flex items-center gap-1 rounded text-xs text-accent',
                  focusRing,
                )}
              >
                Open <ExternalLink aria-hidden="true" className="size-3" />
              </a>
            }
          />
          <iframe
            title="Invoice PDF"
            src={fileUrl}
            className="h-[calc(100vh-120px)] max-h-[900px] w-full bg-white"
          />
        </Card>

        <div className="min-w-0 space-y-4">
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(
              'inline-flex items-center gap-1 rounded text-sm text-accent lg:hidden',
              focusRing,
            )}
          >
            View original PDF <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
          {invoice.status !== 'PROCESSING' && invoice.status !== 'FAILED' && (
            <>
              <InvoiceFieldsForm invoice={invoice} form={form} editable={reviewable} />
              <DiscrepancyList discrepancies={invoice.discrepancies} explanation={explanation} />
              <PoComparison
                purchaseOrder={invoice.purchaseOrder}
                lines={invoice.lines}
                currency={invoice.currency}
              />
            </>
          )}
          <AuditTrail events={invoice.auditEvents} />
        </div>
      </div>

      {reviewable && (
        <ReviewActions
          invoice={invoice}
          changes={form.changes}
          dirty={form.dirty}
          onDiscard={form.reset}
        />
      )}
    </>
  );
}

function FailurePanel({ invoice }: { invoice: InvoiceDetail }) {
  const raw = invoice.rawExtraction;
  const reason =
    raw?.reason ?? raw?.error ?? 'The agent could not extract valid data from this document.';
  return (
    <Card className="border-failed/40">
      <CardBody className="space-y-3">
        <p className="flex items-start gap-2 text-sm">
          <CircleX aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-failed" />
          {reason}
        </p>
        {raw?.rawOutputs && raw.rawOutputs.length > 0 && (
          <details>
            <summary className={cn('cursor-pointer rounded text-xs text-text-muted', focusRing)}>
              Raw model output ({raw.rawOutputs.length} attempts)
            </summary>
            <pre className="amount mt-2 max-h-64 overflow-auto rounded-lg border border-border bg-bg p-3 text-xs">
              {raw.rawOutputs.join('\n\n---\n\n')}
            </pre>
          </details>
        )}
      </CardBody>
    </Card>
  );
}
