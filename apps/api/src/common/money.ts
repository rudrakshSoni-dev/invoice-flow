const MINOR_UNIT_DIGITS: Record<string, number> = { JPY: 0, KRW: 0 };

export function minorDigits(currency: string): number {
  return MINOR_UNIT_DIGITS[currency.toUpperCase()] ?? 2;
}

/** Converts a decimal amount string like "1,234.50" into integer minor units without float math. */
export function toMinor(amount: string, currency: string): number {
  const digits = minorDigits(currency);
  const cleaned = amount.replace(/[,\s]/g, '');
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) throw new Error(`Not a decimal amount: "${amount}"`);
  const [, sign, whole = '0', fraction = ''] = match;
  if (fraction.length > digits) throw new Error(`Too many decimals for ${currency}: "${amount}"`);
  const minor = Number(whole + fraction.padEnd(digits, '0'));
  return sign ? -minor : minor;
}

export function formatMinor(amountMinor: number, currency: string): string {
  const digits = minorDigits(currency);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amountMinor / 10 ** digits);
}
