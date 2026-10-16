import { Bot, ChevronRight, User } from 'lucide-react';
import type { AuditEvent } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { Card } from './ui/card';

const STEP_LABEL: Record<AuditEvent['step'], string> = {
  UPLOADED: 'Uploaded',
  EXTRACTED: 'Extracted',
  MATCHED: 'Matched',
  DECIDED: 'Decided',
  REVIEWED: 'Reviewed',
  POSTED: 'Posted',
};

export function AuditTrail({ events }: { events: AuditEvent[] }) {
  return (
    <Card>
      <details className="group" open>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-accent">
          <ChevronRight
            aria-hidden="true"
            className="size-4 transition-transform duration-150 group-open:rotate-90"
          />
          Audit trail ({events.length})
        </summary>
        <ol className="border-t border-border px-4 py-3">
          {events.map((event, index) => {
            const Icon = event.actor === 'AGENT' ? Bot : User;
            return (
              <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
                {index < events.length - 1 && (
                  <span
                    className="absolute left-[11px] top-6 h-[calc(100%-16px)] w-px bg-border"
                    aria-hidden="true"
                  />
                )}
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-bg">
                  <Icon aria-hidden="true" className="size-3.5 text-text-muted" />
                </span>
                <div className="min-w-0 text-sm">
                  <p>
                    <span className="font-medium">{STEP_LABEL[event.step]}</span>
                    <span className="text-text-muted">
                      {' '}
                      · {event.actor === 'AGENT' ? 'Agent' : 'Reviewer'} ·{' '}
                      {formatDateTime(event.createdAt)}
                    </span>
                  </p>
                  <p className="mt-0.5 break-words text-text-muted">{event.summary}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </details>
    </Card>
  );
}
