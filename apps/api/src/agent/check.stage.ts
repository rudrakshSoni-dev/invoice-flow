import { formatMinor } from '../common/money';
import type { DraftDiscrepancy } from './discrepancy';
import type { ExtractedLine } from './extract.stage';
import { type PurchaseOrderCandidate, remainingMinor } from './match.stage';
import { nameSimilarity } from './text-similarity';

/** Overage above the PO's remaining balance that is still only a warning. */
export const AMOUNT_TOLERANCE = 0.02;
/** Minimum description similarity to pair an invoice line with a PO line. */
export const LINE_MATCH_THRESHOLD = 0.6;

export type CheckInput = {
  currency: string;
  subtotalMinor: number;
  lines: ExtractedLine[];
  confidence: number;
  purchaseOrder: PurchaseOrderCandidate | null;
};

/** DESIGN.md section 7, stage 3. Rules only, no LLM judgment. */
export function checkAgainstPurchaseOrder(
  input: CheckInput,
  confidenceThreshold: number,
): DraftDiscrepancy[] {
  const issues: DraftDiscrepancy[] = [];
  const po = input.purchaseOrder;

  if (po && po.currency !== input.currency) {
    issues.push({
      type: 'CURRENCY_MISMATCH',
      severity: 'BLOCKING',
      message: `Invoice is billed in ${input.currency} but ${po.poNumber} is in ${po.currency}.`,
      expected: po.currency,
      actual: input.currency,
    });
  } else if (po) {
    issues.push(...checkAmount(input.subtotalMinor, po));
  }

  if (po) issues.push(...checkQuantities(input.lines, po));

  if (input.confidence < confidenceThreshold) {
    issues.push({
      type: 'LOW_CONFIDENCE',
      severity: 'WARNING',
      message: `Extraction confidence ${input.confidence.toFixed(2)} is below the ${confidenceThreshold.toFixed(2)} threshold.`,
      expected: `>= ${confidenceThreshold.toFixed(2)}`,
      actual: input.confidence.toFixed(2),
    });
  }

  return issues;
}

function checkAmount(subtotalMinor: number, po: PurchaseOrderCandidate): DraftDiscrepancy[] {
  const remaining = remainingMinor(po);
  const fmt = (minor: number) => formatMinor(minor, po.currency);
  const overMinor = subtotalMinor - remaining;
  if (overMinor <= 0) return [];

  if (remaining <= 0) {
    return [
      {
        type: 'AMOUNT_MISMATCH',
        severity: 'BLOCKING',
        message: `${po.poNumber} is already fully billed; this invoice adds ${fmt(subtotalMinor)}.`,
        expected: fmt(0),
        actual: fmt(subtotalMinor),
      },
    ];
  }

  const overRatio = overMinor / remaining;
  return [
    {
      type: 'AMOUNT_MISMATCH',
      severity: overRatio > AMOUNT_TOLERANCE ? 'BLOCKING' : 'WARNING',
      message:
        `Subtotal ${fmt(subtotalMinor)} is ${(overRatio * 100).toFixed(1)}% over the ` +
        `${fmt(remaining)} remaining on ${po.poNumber}.`,
      expected: `<= ${fmt(remaining)}`,
      actual: fmt(subtotalMinor),
    },
  ];
}

function checkQuantities(lines: ExtractedLine[], po: PurchaseOrderCandidate): DraftDiscrepancy[] {
  const issues: DraftDiscrepancy[] = [];
  for (const line of lines) {
    let best: { quantity: number; description: string; score: number } | null = null;
    for (const poLine of po.lines) {
      const score = nameSimilarity(line.description, poLine.description);
      if (score >= LINE_MATCH_THRESHOLD && (!best || score > best.score))
        best = { ...poLine, score };
    }
    if (best && line.quantity > best.quantity) {
      issues.push({
        type: 'QUANTITY_MISMATCH',
        severity: 'BLOCKING',
        message: `"${line.description}": invoiced ${line.quantity}, but ${po.poNumber} ordered ${best.quantity}.`,
        expected: `<= ${best.quantity}`,
        actual: String(line.quantity),
      });
    }
  }
  return issues;
}

export type Decision = 'AUTO_APPROVED' | 'NEEDS_REVIEW';

export function decide(
  discrepancies: DraftDiscrepancy[],
  confidence: number,
  confidenceThreshold: number,
): Decision {
  const needsAttention = discrepancies.some((d) => d.severity !== 'INFO');
  return !needsAttention && confidence >= confidenceThreshold ? 'AUTO_APPROVED' : 'NEEDS_REVIEW';
}
