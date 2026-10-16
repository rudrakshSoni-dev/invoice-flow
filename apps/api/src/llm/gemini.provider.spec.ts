import { GeminiProvider } from './gemini.provider';
import { LlmError } from './llm-provider';

const okBody = {
  candidates: [{ content: { parts: [{ text: '{"isInvoice":' }, { text: 'false}' }] } }],
  usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 8 },
  modelVersion: 'gemini-2.5-flash-001',
};

describe('GeminiProvider', () => {
  it('sends the prompt and PDF inline and returns text with usage', async () => {
    const fetchFn = jest.fn().mockResolvedValue(Response.json(okBody));
    const provider = new GeminiProvider('key-123', 'gemini-2.5-flash', fetchFn);

    const result = await provider.generateJson({
      prompt: 'Extract',
      attachments: [{ mimeType: 'application/pdf', data: Buffer.from('%PDF') }],
    });

    expect(result).toEqual({
      text: '{"isInvoice":false}',
      model: 'gemini-2.5-flash-001',
      tokensIn: 120,
      tokensOut: 8,
    });
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/models/gemini-2.5-flash:generateContent');
    expect(init.headers).toMatchObject({ 'x-goog-api-key': 'key-123' });
    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts).toEqual([
      { inlineData: { mimeType: 'application/pdf', data: Buffer.from('%PDF').toString('base64') } },
      { text: 'Extract' },
    ]);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('fails without calling the API when no key is configured', async () => {
    const fetchFn = jest.fn();
    await expect(
      new GeminiProvider('', undefined, fetchFn).generateJson({ prompt: 'x' }),
    ).rejects.toMatchObject({
      retryable: false,
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    [429, true],
    [503, true],
    [400, false],
    [403, false],
  ])('maps HTTP %i to an LlmError with retryable=%s', async (status, retryable) => {
    const fetchFn = jest.fn().mockResolvedValue(new Response('nope', { status }));
    const error = await new GeminiProvider('k', undefined, fetchFn)
      .generateJson({ prompt: 'x' })
      .catch((e) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toMatchObject({ retryable });
  });

  it('treats network failures as retryable', async () => {
    const fetchFn = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
    await expect(
      new GeminiProvider('k', undefined, fetchFn).generateJson({ prompt: 'x' }),
    ).rejects.toMatchObject({
      retryable: true,
    });
  });
});
