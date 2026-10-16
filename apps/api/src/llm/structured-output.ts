import type { AgentRunStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { z } from 'zod';
import { LlmError, type LlmAttachment, type LlmProvider } from './llm-provider';

export type RenderedPrompt = {
  /** e.g. "extract-invoice@v1", stored on every AgentRun. */
  version: string;
  text: string;
};

export function hashPrompt(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export type AgentRunLog = {
  promptVersion: string;
  promptHash: string;
  model: string;
  latencyMs: number;
  tokensIn: number | null;
  tokensOut: number | null;
  status: AgentRunStatus;
};

export type StructuredRequest<S extends z.ZodType> = {
  prompt: RenderedPrompt;
  schema: S;
  attachments?: LlmAttachment[];
};

export type StructuredResult<T> =
  | { ok: true; data: T; attempts: number; rawOutput: string }
  | { ok: false; error: string; attempts: number; rawOutputs: string[] };

/** Bound to a provider and a run logger; this is what agent stages depend on. */
export type StructuredLlm = <S extends z.ZodType>(
  request: StructuredRequest<S>,
) => Promise<StructuredResult<z.infer<S>>>;

export const MAX_SCHEMA_RETRIES = 2;

function parseJson(text: string): unknown {
  const unfenced = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(unfenced);
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
}

function withFeedback(prompt: string, previousOutput: string, error: string): string {
  return `${prompt}

Your previous response was rejected.
Previous response:
${previousOutput}

Problems: ${error}

Return the corrected JSON object only.`;
}

/**
 * Calls the model, validates the JSON against `schema`, and retries with the validation error
 * in the prompt (up to `maxRetries` times). Every attempt is logged. Transport errors are logged
 * and rethrown so the caller can decide whether to retry later.
 */
export async function generateStructured<S extends z.ZodType>(
  provider: LlmProvider,
  logRun: (run: AgentRunLog) => Promise<void>,
  { prompt, schema, attachments }: StructuredRequest<S>,
  maxRetries = MAX_SCHEMA_RETRIES,
): Promise<StructuredResult<z.infer<S>>> {
  const rawOutputs: string[] = [];
  let lastError = '';

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const previous = rawOutputs.at(-1);
    const text =
      previous === undefined ? prompt.text : withFeedback(prompt.text, previous, lastError);
    const base = { promptVersion: prompt.version, promptHash: hashPrompt(text) };
    const startedAt = Date.now();

    let response;
    try {
      response = await provider.generateJson({ prompt: text, attachments });
    } catch (error) {
      await logRun({
        ...base,
        model: provider.name,
        latencyMs: Date.now() - startedAt,
        tokensIn: null,
        tokensOut: null,
        status: 'ERROR',
      });
      throw error instanceof LlmError ? error : new LlmError(String(error), true);
    }

    const usage = {
      ...base,
      model: response.model,
      latencyMs: Date.now() - startedAt,
      tokensIn: response.tokensIn,
      tokensOut: response.tokensOut,
    };
    rawOutputs.push(response.text);

    let json: unknown;
    try {
      json = parseJson(response.text);
    } catch {
      lastError = 'Response was not valid JSON';
      await logRun({ ...usage, status: 'INVALID_OUTPUT' });
      continue;
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      lastError = describeIssues(parsed.error);
      await logRun({ ...usage, status: 'INVALID_OUTPUT' });
      continue;
    }

    await logRun({ ...usage, status: 'SUCCEEDED' });
    return { ok: true, data: parsed.data, attempts: attempt, rawOutput: response.text };
  }

  return { ok: false, error: lastError, attempts: rawOutputs.length, rawOutputs };
}
