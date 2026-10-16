import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  LLM_PROVIDER: z.enum(['gemini', 'anthropic', 'openai']).default('gemini'),
  LLM_API_KEY: z.string().default(''),
  LLM_MODEL: z.string().default(''),
  APP_BASE_URL: z.string().url().default('http://localhost:5173'),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(10),
  PORT: z.coerce.number().int().positive().default(3000),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  return result.data;
}
