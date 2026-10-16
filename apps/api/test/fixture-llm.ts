import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURE_DIR, loadFixtureManifest } from '../scripts/fixture-manifest';
import type { LlmProvider, LlmRequest, LlmResponse } from '../src/llm/llm-provider';
import { perfectOutputFor } from './fake-llm';

/**
 * Answers like a perfect model for the fixture invoices, so the full app can run without an API
 * key (local UI work and the Playwright test). Never used in production.
 */
export class FixtureLlmProvider implements LlmProvider {
  readonly name = 'fixture';
  private readonly fixtures = loadFixtureManifest();
  private readonly pdfs = new Map(
    readdirSync(FIXTURE_DIR)
      .filter((f) => f.endsWith('.pdf'))
      .map((f) => [f, readFileSync(join(FIXTURE_DIR, f))] as const),
  );

  constructor(private readonly latencyMs = 600) {}

  async generateJson({ prompt, attachments = [] }: LlmRequest): Promise<LlmResponse> {
    await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    return {
      text: this.answer(prompt, attachments),
      model: 'fixture-model',
      tokensIn: null,
      tokensOut: null,
    };
  }

  private answer(prompt: string, attachments: NonNullable<LlmRequest['attachments']>): string {
    if (prompt.includes('accounts payable reviewer understand')) {
      const issues = [...prompt.matchAll(/^- \[(?:BLOCKING|WARNING)\] (.+)$/gm)].map((m) => m[1]);
      return JSON.stringify({
        explanation: `${issues[0] ?? 'The rule checks flagged this invoice.'} Check the highlighted fields against the purchase order and confirm with the vendor before approving.`,
      });
    }

    const attached = attachments[0]?.data;
    const fixture = attached
      ? this.fixtures.find((f) => this.pdfs.get(f.file)?.equals(attached))
      : this.fixtures.find(
          (f) => f.expected.isInvoice && prompt.includes(f.expected.invoiceNumber),
        );

    return fixture
      ? perfectOutputFor(fixture.file)
      : JSON.stringify({ isInvoice: false, reason: 'The document does not look like an invoice.' });
  }
}
