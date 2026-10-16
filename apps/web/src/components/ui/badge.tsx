import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type Tone = 'neutral' | 'accent' | 'approved' | 'review' | 'failed' | 'processing';

const TONES: Record<Tone, string> = {
  neutral: 'border-border text-text-muted',
  accent: 'border-accent/40 bg-accent/10 text-accent',
  approved: 'border-approved/40 bg-approved/10 text-approved',
  review: 'border-review/40 bg-review/10 text-review',
  failed: 'border-failed/40 bg-failed/10 text-failed',
  processing: 'border-processing/40 bg-processing/10 text-processing',
};

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
