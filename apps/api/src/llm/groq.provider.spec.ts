import { GroqProvider } from './groq.provider';
import { LlmError } from './llm-provider';

const okBody = {
  choices: [{ message: { content: '{"isInvoice":false}' } }],
  usage: { prompt_tokens: 120, completion_tokens: 8 },
  model: 'openai/gpt-oss-120b',
};

describe('GroqProvider', () => {
  it('sends the prompt and returns text with usage', async () => {
    const fetchFn = jest.fn().mockResolvedValue(Response.json(okBody));
    const provider = new GroqProvider('gsk-test', 'openai/gpt-oss-120b', fetchFn);

    const result = await provider.generateJson({
      prompt: 'Extract',
    });

    expect(result).toEqual({
      text: '{"isInvoice":false}',
      model: 'openai/gpt-oss-120b',
      tokensIn: 120,
      tokensOut: 8,
    });
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(init.headers).toMatchObject({
      authorization: 'Bearer gsk-test',
      'content-type': 'application/json',
    });
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('openai/gpt-oss-120b');
    expect(body.messages[0].content).toBe('Extract');
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('fails without calling the API when no key is configured', async () => {
    const fetchFn = jest.fn();
    await expect(
      new GroqProvider('', undefined, fetchFn).generateJson({ prompt: 'x' }),
    ).rejects.toMatchObject({
      retryable: false,
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    [429, true],
    [503, true],
    [400, false],
    [401, false],
  ])('maps HTTP %i to an LlmError with retryable=%s', async (status, retryable) => {
    const fetchFn = jest.fn().mockResolvedValue(new Response('nope', { status }));
    const error = await new GroqProvider('k', undefined, fetchFn)
      .generateJson({ prompt: 'x' })
      .catch((e) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toMatchObject({ retryable });
  });

  it('treats network failures as retryable', async () => {
    const fetchFn = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
    await expect(
      new GroqProvider('k', undefined, fetchFn).generateJson({ prompt: 'x' }),
    ).rejects.toMatchObject({
      retryable: true,
    });
  });
});
