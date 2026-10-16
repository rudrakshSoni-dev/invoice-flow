import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FieldConfidence } from '../src/agent/extraction.schema';
import type { LlmProvider, LlmRequest, LlmResponse } from '../src/llm/llm-provider';
import { FIXTURE_DIR, loadFixtureManifest } from '../scripts/fixture-manifest';

export const HIGH_CONFIDENCE: FieldConfidence = {
  vendor: 0.98,
  invoiceNumber: 0.99,
  dates: 0.97,
  currency: 0.99,
  lineItems: 0.95,
  totals: 0.97,
};

/** Replays canned outputs in order and records every request it receives. */
export class ScriptedLlmProvider implements LlmProvider {
  readonly name = 'scripted';
  readonly requests: LlmRequest[] = [];

  constructor(private readonly outputs: Array<string | Error> = []) {}

  clear(): void {
    this.outputs.length = 0;
    this.requests.length = 0;
  }

  push(...outputs: Array<string | Error>): this {
    this.outputs.push(...outputs);
    return this;
  }

  async generateJson(request: LlmRequest): Promise<LlmResponse> {
    this.requests.push(request);
    const next = this.outputs.shift();
    if (next === undefined) throw new Error('ScriptedLlmProvider ran out of outputs');
    if (next instanceof Error) throw next;
    return { text: next, model: 'scripted-model', tokensIn: 100, tokensOut: 50 };
  }
}

export function readFixturePdf(file: string): Buffer {
  return readFileSync(join(FIXTURE_DIR, file));
}

/** What a perfect model would return for a fixture, per the manifest's ground truth. */
export function perfectOutputFor(
  file: string,
  confidence: FieldConfidence = HIGH_CONFIDENCE,
): string {
  const fixture = loadFixtureManifest().find((f) => f.file === file);
  if (!fixture) throw new Error(`No fixture named ${file}`);
  return JSON.stringify(
    fixture.expected.isInvoice
      ? { ...fixture.expected, confidence }
      : { isInvoice: false, reason: 'The document is meeting notes, not an invoice.' },
  );
}
