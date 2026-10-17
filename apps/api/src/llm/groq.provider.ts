import { z } from 'zod';
import { LlmError, type LlmProvider, type LlmRequest, type LlmResponse } from './llm-provider';

export const GROQ_DEFAULT_MODEL = 'openai/gpt-oss-120b';
const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const TIMEOUT_MS = 60_000;

const responseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable().optional(),
        }),
      }),
    )
    .min(1),
  model: z.string().optional(),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
    })
    .optional(),
});

export class GroqProvider implements LlmProvider {
  readonly name = 'groq';

  constructor(
    private readonly apiKey: string,
    private readonly model: string = GROQ_DEFAULT_MODEL,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async generateJson({ prompt, attachments = [] }: LlmRequest): Promise<LlmResponse> {
    if (!this.apiKey) throw new LlmError('LLM_API_KEY is not set', false);

    let content = prompt;
    if (attachments.length > 0) {
      content = `[Note: ${attachments.length} attachment(s) provided]\n\n${prompt}`;
    }

    const body = {
      model: this.model,
      messages: [{ role: 'user', content }],
      response_format: { type: 'json_object' },
      temperature: 0,
    };

    let response: Response;
    try {
      response = await this.fetchFn(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new LlmError(`Groq request failed: ${(error as Error).message}`, true);
    }

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      const retryable = response.status === 429 || response.status >= 500;
      throw new LlmError(`Groq returned ${response.status}: ${detail}`, retryable);
    }

    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) throw new LlmError('Groq response had an unexpected shape', true);

    const [choice] = parsed.data.choices;
    const text = choice?.message?.content ?? '';
    return {
      text,
      model: parsed.data.model ?? this.model,
      tokensIn: parsed.data.usage?.prompt_tokens ?? null,
      tokensOut: parsed.data.usage?.completion_tokens ?? null,
    };
  }
}
