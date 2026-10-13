// Milliunit -> display string using the plan's currency format (YNAB currency_format).
import type { CurrencyFormat } from '../../ynab/client.ts';

/** U+2212, so a negative amount reads as "minus" to screen readers and lines up in tables. */
export const MINUS = '−';

const FALLBACK_DIGITS = 2;

function groupDigits(whole: string, separator: string): string {
  if (separator === '') return whole;
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/**
 * Formats a signed milliunit amount. YNAB milliunits are 1/1000 of a currency unit; the plan's
 * `decimal_digits` (0 to 3) decides the rounding. When the plan has no currency format the amount
 * is shown as plain `1,234.56` with no symbol, rather than guessing a currency.
 */
export function formatMilliunits(milliunits: number, format: CurrencyFormat | null): string {
  const digits =
    format === null ? FALLBACK_DIGITS : Math.min(3, Math.max(0, Math.trunc(format.decimal_digits)));
  const decimalSeparator = format?.decimal_separator ?? '.';
  const groupSeparator = format?.group_separator ?? ',';

  const scaled = Math.round(Math.abs(milliunits) / 10 ** (3 - digits));
  const unit = 10 ** digits;
  const whole = groupDigits(String(Math.floor(scaled / unit)), groupSeparator);
  const fraction = digits === 0 ? '' : String(scaled % unit).padStart(digits, '0');
  const number = digits === 0 ? whole : `${whole}${decimalSeparator}${fraction}`;

  const sign = milliunits < 0 && scaled !== 0 ? MINUS : '';
  if (format === null || !format.display_symbol || format.currency_symbol === '') {
    return `${sign}${number}`;
  }
  return format.symbol_first
    ? `${sign}${format.currency_symbol}${number}`
    : `${sign}${number} ${format.currency_symbol}`;
}
