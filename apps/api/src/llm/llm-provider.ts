export type LlmAttachment = { mimeType: 'application/pdf'; data: Buffer };

export type LlmRequest = {
  prompt: string;
  attachments?: LlmAttachment[];
};

export type LlmResponse = {
  text: string;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
};

/** The only way the app talks to a model. Implementations are swapped with LLM_PROVIDER. */
export interface LlmProvider {
  readonly name: string;
  generateJson(request: LlmRequest): Promise<LlmResponse>;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export class LlmError extends Error {
  constructor(
    message: string,
    /** Whether retrying the same request later could succeed (rate limits, outages, timeouts). */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
