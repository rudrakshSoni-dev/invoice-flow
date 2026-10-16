import {
  CircleCheck,
  CircleX,
  Loader,
  TriangleAlert,
  type LucideIcon,
  BadgeCheck,
  Ban,
} from 'lucide-react';
import type { InvoiceStatus } from '../lib/api';
import { STATUS_LABEL } from '../lib/status';
import { Badge, type Tone } from './ui/badge';

const STYLE: Record<InvoiceStatus, { tone: Tone; icon: LucideIcon }> = {
  PROCESSING: { tone: 'processing', icon: Loader },
  AUTO_APPROVED: { tone: 'approved', icon: CircleCheck },
  APPROVED: { tone: 'approved', icon: BadgeCheck },
  NEEDS_REVIEW: { tone: 'review', icon: TriangleAlert },
  REJECTED: { tone: 'failed', icon: Ban },
  FAILED: { tone: 'failed', icon: CircleX },
};

/** Status is always icon + label + color, never color alone. */
export function StatusBadge({ status, detail }: { status: InvoiceStatus; detail?: string }) {
  const { tone, icon: Icon } = STYLE[status];
  return (
    <Badge tone={tone}>
      <Icon
        aria-hidden="true"
        className={status === 'PROCESSING' ? 'size-3.5 animate-spin' : 'size-3.5'}
      />
      {STATUS_LABEL[status]}
      {detail && <span className="font-normal opacity-80">· {detail}</span>}
    </Badge>
  );
}
