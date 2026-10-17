import { join } from 'node:path';
import { z } from 'zod';

const envSchema = z
  .object({
    DATABASE_URL: z.string().url(),
    LLM_PROVIDER: z.enum(['gemini', 'anthropic', 'openai', 'groq']).default('gemini'),
    LLM_API_KEY: z.string().default(''),
    LLM_MODEL: z.string().default(''),
    APP_BASE_URL: z.string().url().default('http://localhost:5173'),
    MAX_UPLOAD_MB: z.coerce.number().int().positive().default(10),
    PORT: z.coerce.number().int().positive().default(3000),
    UPLOAD_DIR: z.string().default('uploads'),
    STORAGE_DRIVER: z.enum(['local', 'gcs', 'db']).default('local'),
    GCS_BUCKET: z.string().default(''),
    WORKER_ENABLED: z.stringbool().default(true),
    FIXTURES_DIR: z.string().default(join(__dirname, '../../../../fixtures')),
    CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.85),
    // Public demo: uploaded invoices are deleted after this many hours. 0 keeps them.
    UPLOAD_RETENTION_HOURS: z.coerce.number().nonnegative().default(0),
  })
  .refine((env) => env.STORAGE_DRIVER !== 'gcs' || env.GCS_BUCKET, {
    path: ['GCS_BUCKET'],
    message: 'required when STORAGE_DRIVER=gcs',
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
