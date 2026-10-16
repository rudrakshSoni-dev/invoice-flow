import { formatDuration, formatMoney, formatPercent, minorToDecimal } from './format';

describe('format helpers', () => {
  it('formats minor units as money', () => {
    expect(formatMoney(149472, 'USD')).toBe('$1,494.72');
    expect(formatMoney(1500, 'JPY')).toBe('¥1,500');
    expect(formatMoney(null, 'USD')).toBe('—');
  });

  it('converts minor units to the decimal strings the API accepts', () => {
    expect(minorToDecimal(149472, 'USD')).toBe('1494.72');
    expect(minorToDecimal(5, 'USD')).toBe('0.05');
    expect(minorToDecimal(-307, 'USD')).toBe('-3.07');
    expect(minorToDecimal(1500, 'JPY')).toBe('1500');
    expect(minorToDecimal(null, 'USD')).toBe('');
  });

  it('formats durations and percentages', () => {
    expect(formatDuration(850)).toBe('850 ms');
    expect(formatDuration(4200)).toBe('4.2 s');
    expect(formatDuration(null)).toBe('—');
    expect(formatPercent(0.333)).toBe('33%');
    expect(formatPercent(null)).toBe('—');
  });
});
