const currencyFormatters = new Map<string, Intl.NumberFormat>();

function normaliseCurrency(currency: string | undefined): string {
  if (!currency) return 'USD';
  const map: Record<string, string> = { $: 'USD', '£': 'GBP', '€': 'EUR' };
  const code = map[currency] ?? currency.toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : 'USD';
}

export function formatCurrency(
  value: number,
  currency?: string,
  options: { compact?: boolean; decimals?: number } = {}
): string {
  const code = normaliseCurrency(currency);
  const decimals = options.decimals ?? (Number.isInteger(value) ? 0 : 2);
  const key = `${code}:${options.compact ? 'c' : 'f'}:${decimals}`;
  let fmt = currencyFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      notation: options.compact ? 'compact' : 'standard',
      minimumFractionDigits: options.compact ? 0 : decimals,
      maximumFractionDigits: options.compact ? 1 : decimals,
    });
    currencyFormatters.set(key, fmt);
  }
  return fmt.format(value);
}

export function formatNumber(value: number, options: { compact?: boolean } = {}): string {
  return new Intl.NumberFormat('en-US', {
    notation: options.compact ? 'compact' : 'standard',
    maximumFractionDigits: options.compact ? 1 : 2,
  }).format(value);
}

export function formatPercent(value: number, decimals = 0): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatRelativeTime(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSeconds);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (abs < 45) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSeconds / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(diffSeconds / 86400), 'day');
  return formatDate(iso);
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Converts a display string such as "$1,204.50", "4.2%" or "1.2k" into a number for sorting. */
export function parseSortableNumber(value: string | number): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const trimmed = value.trim();
  const match = trimmed.match(/^[^\d\-.]*(-?[\d,]*\.?\d+)\s*([kKmMbB%]?)\s*$/);
  if (!match) return null;
  const base = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(base)) return null;
  const suffix = match[2].toLowerCase();
  const multiplier = suffix === 'k' ? 1e3 : suffix === 'm' ? 1e6 : suffix === 'b' ? 1e9 : 1;
  return base * multiplier;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
