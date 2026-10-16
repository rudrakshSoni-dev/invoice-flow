import { Check } from 'lucide-react';
import type { PipelineStage } from '../lib/api';
import { cn } from '../lib/cn';

export const STAGES: Array<{ id: PipelineStage; label: string }> = [
  { id: 'EXTRACT', label: 'Extract' },
  { id: 'MATCH', label: 'Match' },
  { id: 'CHECK', label: 'Check' },
  { id: 'POST', label: 'Post' },
];

export function StageStepper({ current }: { current: PipelineStage | undefined }) {
  const currentIndex = Math.max(
    0,
    STAGES.findIndex((s) => s.id === current),
  );
  return (
    <ol className="flex items-center gap-2" aria-label="Agent progress">
      {STAGES.map((stage, index) => {
        const state =
          index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'pending';
        return (
          <li
            key={stage.id}
            className="flex items-center gap-2"
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-full border text-xs',
                state === 'done' && 'border-approved bg-approved/15 text-approved',
                state === 'current' &&
                  'animate-pulse border-processing bg-processing/15 text-processing',
                state === 'pending' && 'border-border text-text-muted',
              )}
            >
              {state === 'done' ? <Check aria-hidden="true" className="size-3.5" /> : index + 1}
            </span>
            <span className={cn('text-sm', state === 'pending' ? 'text-text-muted' : 'text-text')}>
              {stage.label}
              <span className="sr-only">
                {state === 'done' ? ' (done)' : state === 'current' ? ' (in progress)' : ''}
              </span>
            </span>
            {index < STAGES.length - 1 && (
              <span className="h-px w-6 bg-border sm:w-10" aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
