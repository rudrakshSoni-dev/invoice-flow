import { z } from 'zod';
import { ScriptedLlmProvider } from '../../test/fake-llm';
import { LlmError } from './llm-provider';
import { type AgentRunLog, generateStructured } from './structured-output';

const schema = z.object({ total: z.string().regex(/^\d+\.\d{2}$/) });
const prompt = { version: 'test@v1', text: 'Return the total.' };

describe('generateStructured', () => {
  let runs: AgentRunLog[];
  const logRun = async (run: AgentRunLog) => {
    runs.push(run);
  };

  beforeEach(() => {
    runs = [];
  });

  it('returns validated data on the first good answer', async () => {
    const provider = new ScriptedLlmProvider(['```json\n{"total":"12.50"}\n```']);
    const result = await generateStructured(provider, logRun, { prompt, schema });
    expect(result).toEqual({
      ok: true,
      data: { total: '12.50' },
      attempts: 1,
      rawOutput: expect.any(String),
    });
    expect(runs).toMatchObject([
      {
        promptVersion: 'test@v1',
        model: 'scripted-model',
        status: 'SUCCEEDED',
        tokensIn: 100,
        tokensOut: 50,
      },
    ]);
    expect(runs[0]?.promptHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('retries with the validation error in the prompt', async () => {
    const provider = new ScriptedLlmProvider(['not json', '{"total":"12.5"}', '{"total":"12.50"}']);
    const result = await generateStructured(provider, logRun, { prompt, schema });

    expect(result).toMatchObject({ ok: true, attempts: 3 });
    expect(runs.map((r) => r.status)).toEqual(['INVALID_OUTPUT', 'INVALID_OUTPUT', 'SUCCEEDED']);
    expect(provider.requests[1]?.prompt).toContain('Response was not valid JSON');
    expect(provider.requests[2]?.prompt).toContain('total:');
    expect(provider.requests[2]?.prompt).toContain('{"total":"12.5"}');
    expect(new Set(runs.map((r) => r.promptHash)).size).toBe(3);
  });

  it('gives up after two retries and returns every raw output', async () => {
    const provider = new ScriptedLlmProvider(['{}', '{}', '{}', '{"total":"1.00"}']);
    const result = await generateStructured(provider, logRun, { prompt, schema });
    expect(result).toMatchObject({ ok: false, attempts: 3, rawOutputs: ['{}', '{}', '{}'] });
    expect(provider.requests).toHaveLength(3);
  });

  it('logs and rethrows provider errors', async () => {
    const provider = new ScriptedLlmProvider([new LlmError('rate limited', true)]);
    await expect(generateStructured(provider, logRun, { prompt, schema })).rejects.toMatchObject({
      retryable: true,
    });
    expect(runs).toMatchObject([{ status: 'ERROR' }]);
  });
});
