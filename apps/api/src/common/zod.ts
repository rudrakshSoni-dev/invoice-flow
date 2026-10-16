import type { z } from 'zod';
import { ValidationError } from './domain-errors';

export function parseOrThrow<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`);
    throw new ValidationError(issues.join('; '));
  }
  return result.data;
}
