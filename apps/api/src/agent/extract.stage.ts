import { z } from 'zod';
import { toMinor } from '../common/money';
import type { LlmAttachment } from '../llm/llm-provider';
import type { StructuredLlm } from '../llm/structured-output';
import type { DraftDiscrepancy } from './discrepancy';
import {
  type ExtractedInvoiceFields,
  type FieldConfidence,
  llmExtractionSchema,
} from './extraction.schema';
import { extractPdfText, hasUsableText } from './pdf-text';
import { renderPrompt } from './prompts';
import { checkInvoiceMath } from './sanity-checks';

export const EXTRACT_PROMPT = { name: 'extract-invoice', version: 'v1' } as const;
/** Scanned documents read by the vision model are trusted a little less than a text layer. */
export const VISION_CONFIDENCE_FACTOR = 0.9;
/** A document whose own arithmetic is wrong can never clear the review threshold. */
export const MATH_ERROR_CONFIDENCE_CAP = 0.6;

const SCHEMA_JSON = JSON.stringify(z.toJSONSchema(llmExtractionSchema), null, 2);

export type ExtractionMode = 'text' | 'vision';

export type ExtractedLine = {
  description: string;
  quantity: number;
  unitPriceMinor: number;
  totalMinor: number;
};

export type ExtractionSuccess = {
  ok: true;
  mode: ExtractionMode;
  attempts: number;
  fields: ExtractedInvoiceFields;
  lines: ExtractedLine[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  fieldConfidence: FieldConfidence;
  confidence: number;
  discrepancies: DraftDiscrepancy[];
};

export type ExtractionFailure = {
  ok: false;
  mode: ExtractionMode;
  attempts: number;
  reason: string;
  rawOutputs: string[];
};

export type ExtractionResult = ExtractionSuccess | ExtractionFailure;

export async function extractInvoice(pdf: Buffer, llm: StructuredLlm): Promise<ExtractionResult> {
  const text = await extractPdfText(pdf).catch(() => '');
  const mode: ExtractionMode = hasUsableText(text) ? 'text' : 'vision';
  const attachments: LlmAttachment[] =
    mode === 'vision' ? [{ mimeType: 'application/pdf', data: pdf }] : [];
  const document =
    mode === 'text'
      ? `<document_text>\n${text}\n</document_text>`
      : 'The invoice is attached as a PDF. It is a scan with no text layer, so read it visually.';

  const prompt = renderPrompt(EXTRACT_PROMPT.name, EXTRACT_PROMPT.version, {
    schema: SCHEMA_JSON,
    document,
  });
  const result = await llm({ prompt, schema: llmExtractionSchema, attachments });

  if (!result.ok) {
    return {
      ok: false,
      mode,
      attempts: result.attempts,
      reason: `Model output failed validation: ${result.error}`,
      rawOutputs: result.rawOutputs,
    };
  }
  if (!result.data.isInvoice) {
    return {
      ok: false,
      mode,
      attempts: result.attempts,
      reason: `Not an invoice: ${result.data.reason}`,
      rawOutputs: [result.rawOutput],
    };
  }

  const { confidence: fieldConfidence, ...fields } = result.data;
  const minor = (amount: string) => toMinor(amount, fields.currency);
  const lines = fields.lineItems.map((line) => ({
    description: line.description,
    quantity: line.quantity,
    unitPriceMinor: minor(line.unitPrice),
    totalMinor: minor(line.total),
  }));
  const amounts = {
    subtotalMinor: minor(fields.subtotal),
    taxMinor: minor(fields.tax),
    totalMinor: minor(fields.total),
  };
  const discrepancies = checkInvoiceMath({ currency: fields.currency, lines, ...amounts });

  let confidence = Math.min(...Object.values(fieldConfidence));
  if (mode === 'vision') confidence *= VISION_CONFIDENCE_FACTOR;
  if (discrepancies.length > 0) confidence = Math.min(confidence, MATH_ERROR_CONFIDENCE_CAP);

  return {
    ok: true,
    mode,
    attempts: result.attempts,
    fields,
    lines,
    ...amounts,
    fieldConfidence,
    confidence: Math.round(confidence * 100) / 100,
    discrepancies,
  };
}
