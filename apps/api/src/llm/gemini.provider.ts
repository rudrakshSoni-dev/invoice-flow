import { z } from 'zod';
import { LlmError, type LlmProvider, type LlmRequest, type LlmResponse } from './llm-provider';

export const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_MS = 60_000;

const responseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({ parts: z.array(z.object({ text: z.string().optional() })) }).optional(),
        finishReason: z.string().optional(),
      }),
    )
    .min(1),
  usageMetadata: z
    .object({
      promptTokenCount: z.number().optional(),
      candidatesTokenCount: z.number().optional(),
    })
    .optional(),
  modelVersion: z.string().optional(),
});

export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';

  constructor(
    private readonly apiKey: string,
    private readonly model: string = GEMINI_DEFAULT_MODEL,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async generateJson({ prompt, attachments = [] }: LlmRequest): Promise<LlmResponse> {
    if (!this.apiKey) throw new LlmError('LLM_API_KEY is not set', false);

    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            ...attachments.map((a) => ({
              inlineData: { mimeType: a.mimeType, data: a.data.toString('base64') },
            })),
            { text: prompt },
          ],
        },
      ],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    };

    let response: Response;
    try {
      response = await this.fetchFn(
        `${API_BASE}/models/${encodeURIComponent(this.model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
    } catch (error) {
      throw new LlmError(`Gemini request failed: ${(error as Error).message}`, true);
    }

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      const retryable = response.status === 429 || response.status >= 500;
      throw new LlmError(`Gemini returned ${response.status}: ${detail}`, retryable);
    }

    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) throw new LlmError('Gemini response had an unexpected shape', true);

    const [candidate] = parsed.data.candidates;
    const text = candidate?.content?.parts.map((p) => p.text ?? '').join('') ?? '';
    return {
      text,
      model: parsed.data.modelVersion ?? this.model,
      tokensIn: parsed.data.usageMetadata?.promptTokenCount ?? null,
      tokensOut: parsed.data.usageMetadata?.candidatesTokenCount ?? null,
    };
  }
}
