import type { DiscrepancySeverity, DiscrepancyType } from '@prisma/client';

export type DraftDiscrepancy = {
  type: DiscrepancyType;
  severity: DiscrepancySeverity;
  message: string;
  expected?: string;
  actual?: string;
};
