import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT_ENV = join(__dirname, '../../../.env');

/** Integration tests run against an isolated `test` schema so dev data is never touched. */
export function useTestDatabase(): string {
  if (!process.env.DATABASE_URL && existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV);
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL is required for integration tests');
  const url = new URL(base);
  url.searchParams.set('schema', 'test');
  process.env.DATABASE_URL = url.toString();
  return process.env.DATABASE_URL;
}
