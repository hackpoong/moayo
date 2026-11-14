import { describe, expect, it } from 'vitest';
import { evalAmountExpression, formatAmountExpression, hasOperator } from './amount.ts';

describe('evalAmountExpression', () => {
  it('덧셈·뺄셈', () => {
    expect(evalAmountExpression('12000')).toBe(12000);
    expect(evalAmountExpression('12000+3500-500')).toBe(15000);
    expect(evalAmountExpression('1,000+2,000')).toBe(3000);
  });
  it('끝에 붙은 기호는 무시, 음수는 0', () => {
    expect(evalAmountExpression('5000+')).toBe(5000);
    expect(evalAmountExpression('1000-5000')).toBe(0);
  });
  it('틀린 식', () => {
    expect(evalAmountExpression('')).toBeNull();
    expect(evalAmountExpression('+')).toBeNull();
    expect(evalAmountExpression('1++2')).toBeNull();
  });
  it('보기용 문자열', () => {
    expect(formatAmountExpression('12000+3500')).toBe('12,000 + 3,500');
    expect(hasOperator('12000+3')).toBe(true);
    expect(hasOperator('12000')).toBe(false);
  });
});
