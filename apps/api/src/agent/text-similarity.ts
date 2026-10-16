const LEGAL_SUFFIXES = new Set([
  'inc',
  'llc',
  'ltd',
  'gmbh',
  'co',
  'corp',
  'corporation',
  'company',
  'plc',
  'sa',
  'ag',
]);

/** Lowercased word tokens with punctuation and legal-entity suffixes removed. */
export function nameTokens(name: string): Set<string> {
  const tokens = name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !LEGAL_SUFFIXES.has(t));
  return new Set(tokens);
}

/** Dice coefficient over name tokens: 1 for the same words in any order, 0 for nothing in common. */
export function nameSimilarity(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const token of ta) if (tb.has(token)) shared++;
  return (2 * shared) / (ta.size + tb.size);
}

export function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
