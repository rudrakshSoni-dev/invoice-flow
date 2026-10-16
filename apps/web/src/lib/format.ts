const ZERO_DECIMAL = new Set(['JPY', 'KRW']);
const digits = (currency: string) => (ZERO_DECIMAL.has(currency) ? 0 : 2);

export function formatMoney(amountMinor: number | null, currency: string | null): string {
  if (amountMinor === null || !currency) return '—';
  const d = digits(currency);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(amountMinor / 10 ** d);
}

/** Integer minor units to the plain decimal string the API accepts, e.g. 149472 → "1494.72". */
export function minorToDecimal(amountMinor: number | null, currency: string | null): string {
  if (amountMinor === null) return '';
  const d = digits(currency ?? 'USD');
  if (d === 0) return String(amountMinor);
  const sign = amountMinor < 0 ? '-' : '';
  const abs = Math.abs(amountMinor);
  return `${sign}${Math.floor(abs / 10 ** d)}.${String(abs % 10 ** d).padStart(d, '0')}`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(iso),
  );
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

export function formatRelative(iso: string, now = Date.now()): string {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return formatDate(iso);
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60_000)} min`;
}

export function formatPercent(ratio: number | null): string {
  return ratio === null ? '—' : `${Math.round(ratio * 100)}%`;
}

/** `YYYY-MM-DD` for date inputs from an ISO timestamp stored at UTC midnight. */
export function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}
