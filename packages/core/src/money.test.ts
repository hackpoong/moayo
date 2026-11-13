import { describe, expect, it } from 'vitest';
import { formatCompact, formatWon, parseAmount, splitsAreValid } from './money.ts';

describe('금액', () => {
  it('formatWon', () => {
    expect(formatWon(1234567)).toBe('1,234,567원');
    expect(formatWon(0)).toBe('0원');
  });

  it('formatCompact', () => {
    expect(formatCompact(9500)).toBe('9,500');
    expect(formatCompact(12000)).toBe('1.2만');
    expect(formatCompact(100000)).toBe('10만');
    expect(formatCompact(1234567)).toBe('123만');
    expect(formatCompact(250000000)).toBe('2.5억');
  });

  it('parseAmount', () => {
    expect(parseAmount('12,345원')).toBe(12345);
    expect(parseAmount(' 5000 ')).toBe(5000);
    expect(parseAmount('원')).toBeNull();
  });

  it('분할 합계 검증', () => {
    expect(splitsAreValid(100000, [])).toBe(true);
    expect(
      splitsAreValid(100000, [
        { category_id: 'a', amount: 50000 },
        { category_id: 'b', amount: 50000 },
      ]),
    ).toBe(true);
    expect(splitsAreValid(100000, [{ category_id: 'a', amount: 40000 }])).toBe(false);
  });
});
