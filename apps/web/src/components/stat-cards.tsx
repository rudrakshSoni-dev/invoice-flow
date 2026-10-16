import type { Stats } from '../lib/api';
import { formatDuration, formatPercent } from '../lib/format';
import { Card } from './ui/card';
import { Skeleton } from './ui/skeleton';

export function StatCards({ stats }: { stats: Stats | undefined }) {
  const cards = [
    { label: 'Total processed', value: stats ? String(stats.processed) : undefined },
    { label: 'Auto-approved', value: stats ? formatPercent(stats.autoApprovalRate) : undefined },
    { label: 'Needs review', value: stats ? String(stats.needsReview) : undefined },
    {
      label: 'Avg processing time',
      value: stats ? formatDuration(stats.avgProcessingMs) : undefined,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="p-4">
          <p className="text-xs text-text-muted">{card.label}</p>
          {card.value === undefined ? (
            <Skeleton className="mt-2 h-7 w-16" />
          ) : (
            <p className="amount mt-1 text-[28px] font-semibold leading-tight">{card.value}</p>
          )}
        </Card>
      ))}
    </div>
  );
}
