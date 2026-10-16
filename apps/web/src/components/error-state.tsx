import { CircleX, RotateCcw } from 'lucide-react';
import { cn } from '../lib/cn';
import { Button } from './ui/button';

/** Inline load failure with a way out, used wherever a query can fail. */
export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn('flex flex-wrap items-center justify-between gap-3 p-4 text-sm', className)}
    >
      <p className="flex items-start gap-2">
        <CircleX aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-failed" />
        {message}
      </p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        <RotateCcw aria-hidden="true" className="size-3.5" />
        Try again
      </Button>
    </div>
  );
}
