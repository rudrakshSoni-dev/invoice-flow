import { cn } from '../lib/cn';
import { Tooltip } from './ui/tooltip';

export const LOW_CONFIDENCE = 0.85;

/** Small bar plus the number, so the value never depends on color. */
export function Confidence({ value, className }: { value: number | null; className?: string }) {
  if (value === null) return <span className="text-text-muted">—</span>;
  const low = value < LOW_CONFIDENCE;
  return (
    <Tooltip
      content={`Extraction confidence. Below ${LOW_CONFIDENCE} an invoice always goes to review.`}
    >
      <span className={cn('inline-flex items-center gap-2', className)}>
        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-border" aria-hidden="true">
          <span
            className={cn('block h-full rounded-full', low ? 'bg-review' : 'bg-approved')}
            style={{ width: `${Math.round(value * 100)}%` }}
          />
        </span>
        <span className={cn('amount text-xs', low && 'text-review')}>{value.toFixed(2)}</span>
      </span>
    </Tooltip>
  );
}
