import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn('rounded-card border border-border bg-surface', className)} {...props} />
  );
}

export function CardHeader({
  title,
  actions,
  className,
}: {
  title: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex items-center justify-between gap-4 border-b border-border px-4 py-3',
        className,
      )}
    >
      <h2 className="text-sm font-semibold">{title}</h2>
      {actions}
    </header>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...props} />;
}
