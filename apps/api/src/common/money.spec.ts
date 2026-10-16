import { formatMinor, toMinor } from './money';

describe('toMinor', () => {
  it('converts decimal strings to integer minor units', () => {
    expect(toMinor('1,234.50', 'USD')).toBe(123450);
    expect(toMinor('0.1', 'EUR')).toBe(10);
    expect(toMinor('42', 'USD')).toBe(4200);
    expect(toMinor('-3.07', 'USD')).toBe(-307);
  });

  it('respects zero-decimal currencies', () => {
    expect(toMinor('1500', 'JPY')).toBe(1500);
    expect(toMinor('1500.00', 'JPY')).toBe(1500);
  });

  it('rejects malformed or over-precise amounts', () => {
    expect(() => toMinor('12.3.4', 'USD')).toThrow('Not a decimal amount');
    expect(() => toMinor('1.005', 'USD')).toThrow('Too many decimals');
    expect(() => toMinor('1.5', 'JPY')).toThrow('Too many decimals');
  });
});

describe('formatMinor', () => {
  it('formats minor units for display', () => {
    expect(formatMinor(123450, 'USD')).toBe('$1,234.50');
    expect(formatMinor(1500, 'JPY')).toBe('¥1,500');
  });
});
