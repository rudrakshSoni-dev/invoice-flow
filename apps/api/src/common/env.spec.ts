import { loadEnv } from './env';

describe('loadEnv', () => {
  it('applies defaults for optional values', () => {
    const env = loadEnv({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db' });
    expect(env.LLM_PROVIDER).toBe('gemini');
    expect(env.MAX_UPLOAD_MB).toBe(10);
    expect(env.PORT).toBe(3000);
  });

  it('fails fast on missing or invalid values', () => {
    expect(() => loadEnv({})).toThrow('DATABASE_URL');
    expect(() =>
      loadEnv({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db', LLM_PROVIDER: 'cohere' }),
    ).toThrow('LLM_PROVIDER');
  });
});
