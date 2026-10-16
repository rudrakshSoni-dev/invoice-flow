import { z } from 'zod';
import type { StructuredLlm } from '../llm/structured-output';
import type { DraftDiscrepancy } from './discrepancy';
import { renderPrompt } from './prompts';

export const EXPLAIN_PROMPT = { name: 'explain-discrepancies', version: 'v1' } as const;

const explanationSchema = z.object({ explanation: z.string().min(10).max(600) });

export type Explanation = { text: string; source: 'llm' | 'rules' };

/**
 * Optional plain-English summary for the reviewer. The decision never depends on it, so any
 * LLM failure falls back to the rule messages instead of failing the invoice.
 */
export async function explainDiscrepancies(
  input: { invoice: string; purchaseOrder: string; discrepancies: DraftDiscrepancy[] },
  llm: StructuredLlm,
): Promise<Explanation> {
  const relevant = input.discrepancies.filter((d) => d.severity !== 'INFO');
  const fallback: Explanation = { text: relevant.map((d) => d.message).join(' '), source: 'rules' };

  try {
    const prompt = renderPrompt(EXPLAIN_PROMPT.name, EXPLAIN_PROMPT.version, {
      invoice: input.invoice,
      purchaseOrder: input.purchaseOrder,
      issues: relevant.map((d) => `- [${d.severity}] ${d.message}`).join('\n'),
    });
    const result = await llm({ prompt, schema: explanationSchema });
    return result.ok ? { text: result.data.explanation, source: 'llm' } : fallback;
  } catch {
    return fallback;
  }
}
