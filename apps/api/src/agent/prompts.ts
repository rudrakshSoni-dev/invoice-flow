import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RenderedPrompt } from '../llm/structured-output';

/** Prompts live in ./prompts as `<name>.<version>.md` with `{{placeholders}}`. */
export function renderPrompt(
  name: string,
  version: string,
  vars: Record<string, string>,
): RenderedPrompt {
  const template = readFileSync(join(__dirname, 'prompts', `${name}.${version}.md`), 'utf8');
  const text = template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key];
    if (value === undefined)
      throw new Error(`Prompt ${name}.${version} needs a value for {{${key}}}`);
    return value;
  });
  return { version: `${name}@${version}`, text };
}
