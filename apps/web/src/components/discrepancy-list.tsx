import { Info, OctagonAlert, TriangleAlert, Sparkles } from 'lucide-react';
import type { Discrepancy, Severity } from '../lib/api';
import { cn } from '../lib/cn';
import { Card, CardBody, CardHeader } from './ui/card';

const SEVERITY: Record<Severity, { icon: typeof Info; label: string; className: string }> = {
  BLOCKING: { icon: OctagonAlert, label: 'Blocking', className: 'text-failed' },
  WARNING: { icon: TriangleAlert, label: 'Warning', className: 'text-review' },
  INFO: { icon: Info, label: 'Info', className: 'text-text-muted' },
};
const ORDER: Severity[] = ['BLOCKING', 'WARNING', 'INFO'];

export function DiscrepancyList({
  discrepancies,
  explanation,
}: {
  discrepancies: Discrepancy[];
  explanation: string | null;
}) {
  const sorted = [...discrepancies].sort(
    (a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity),
  );
  return (
    <Card>
      <CardHeader title={`Discrepancies (${discrepancies.length})`} />
      <CardBody className="space-y-3">
        {explanation && (
          <div className="flex gap-3 rounded-lg border border-accent/30 bg-accent/5 p-3 text-sm">
            <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
            <p>
              <span className="sr-only">Agent explanation: </span>
              {explanation}
            </p>
          </div>
        )}
        {sorted.length === 0 ? (
          <p className="text-sm text-text-muted">No discrepancies found.</p>
        ) : (
          <ul className="space-y-2">
            {sorted.map((d) => {
              const { icon: Icon, label, className } = SEVERITY[d.severity];
              return (
                <li key={d.id} className="flex gap-3 text-sm">
                  <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', className)} />
                  <div>
                    <p>
                      <span className={cn('mr-2 text-xs font-medium', className)}>{label}</span>
                      {d.message}
                    </p>
                    {(d.expected || d.actual) && (
                      <p className="amount mt-0.5 text-xs text-text-muted">
                        {d.expected && <>expected {d.expected}</>}
                        {d.expected && d.actual && ' · '}
                        {d.actual && <>actual {d.actual}</>}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
