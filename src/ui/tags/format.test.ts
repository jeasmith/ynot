import { describe, expect, it } from 'vite-plus/test';
import { formatMilliunits } from './format.ts';
import { GBP } from './testBudget.ts';

describe('formatMilliunits', () => {
  it('uses the plan currency format', () => {
    expect(formatMilliunits(25_000, GBP)).toBe('£25.00');
    expect(formatMilliunits(-25_000, GBP)).toBe('−£25.00');
    expect(formatMilliunits(1_234_567_890, GBP)).toBe('£1,234,567.89');
    expect(formatMilliunits(0, GBP)).toBe('£0.00');
  });

  it('honours separators, symbol position and decimal digits', () => {
    const eur = {
      ...GBP,
      currency_symbol: '€',
      symbol_first: false,
      decimal_separator: ',',
      group_separator: '.',
    };
    expect(formatMilliunits(-1_234_560, eur)).toBe('−1.234,56 €');
    const yen = { ...GBP, currency_symbol: '¥', decimal_digits: 0 };
    expect(formatMilliunits(1_500_000, yen)).toBe('¥1,500');
    const dinar = { ...GBP, decimal_digits: 3 };
    expect(formatMilliunits(1_234, dinar)).toBe('£1.234');
  });

  it('omits the symbol when the plan hides it', () => {
    expect(formatMilliunits(5_000, { ...GBP, display_symbol: false })).toBe('5.00');
  });

  it('falls back to a plain two-decimal number without a currency format', () => {
    expect(formatMilliunits(-1_234_500, null)).toBe('−1,234.50');
  });

  it('does not show a minus for an amount that rounds to zero', () => {
    expect(formatMilliunits(-4, GBP)).toBe('£0.00');
  });
});
