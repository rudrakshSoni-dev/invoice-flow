import { formatMinor } from '../common/money';
import type { DraftDiscrepancy } from './discrepancy';

/** Rounding slack allowed when comparing printed totals. */
const TOLERANCE_MINOR = 1;

export type InvoiceAmounts = {
  currency: string;
  lines: Array<{ totalMinor: number }>;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
};

export function checkInvoiceMath(amounts: InvoiceAmounts): DraftDiscrepancy[] {
  const { currency, subtotalMinor, taxMinor, totalMinor } = amounts;
  const fmt = (minor: number) => formatMinor(minor, currency);
  const issues: DraftDiscrepancy[] = [];

  const linesSum = amounts.lines.reduce((sum, line) => sum + line.totalMinor, 0);
  if (Math.abs(linesSum - subtotalMinor) > TOLERANCE_MINOR) {
    issues.push({
      type: 'AMOUNT_MISMATCH',
      severity: 'WARNING',
      message: `Line items add up to ${fmt(linesSum)} but the printed subtotal is ${fmt(subtotalMinor)}.`,
      expected: fmt(linesSum),
      actual: fmt(subtotalMinor),
    });
  }

  if (Math.abs(subtotalMinor + taxMinor - totalMinor) > TOLERANCE_MINOR) {
    issues.push({
      type: 'AMOUNT_MISMATCH',
      severity: 'WARNING',
      message: `Subtotal plus tax is ${fmt(subtotalMinor + taxMinor)} but the printed total is ${fmt(totalMinor)}.`,
      expected: fmt(subtotalMinor + taxMinor),
      actual: fmt(totalMinor),
    });
  }

  return issues;
}
