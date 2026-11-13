import { describe, expect, it } from 'vitest';
import { cashFlows, computeCashDate, creditCardPaymentDate } from './cashDate.ts';
import type { BillingRule } from './types.ts';

// 결제일 14일, 이용기간 전월 1일~말일
const endOfMonth: BillingRule = { closing_day: 31, payment_day: 14, payment_month_offset: 1 };
// 결제일 25일, 이용기간 전월 12일~당월 11일
const midMonth: BillingRule = { closing_day: 11, payment_day: 25, payment_month_offset: 0 };

describe('creditCardPaymentDate', () => {
  it('말일 마감: 그 달에 쓴 것은 다음 달 결제일에 나간다', () => {
    expect(creditCardPaymentDate('2026-11-01', endOfMonth)).toBe('2026-12-14');
    expect(creditCardPaymentDate('2026-11-30', endOfMonth)).toBe('2026-12-14');
  });

  it('말일 마감: 2월처럼 31일이 없는 달도 그 달 말일까지가 한 기간이다', () => {
    expect(creditCardPaymentDate('2027-02-28', endOfMonth)).toBe('2027-03-14');
    expect(creditCardPaymentDate('2027-03-01', endOfMonth)).toBe('2027-04-14');
  });

  it('연말을 넘어간다', () => {
    expect(creditCardPaymentDate('2026-12-31', endOfMonth)).toBe('2027-01-14');
  });

  it('월중 마감: 마감일까지는 이번 달, 다음 날부터는 다음 달 결제', () => {
    expect(creditCardPaymentDate('2026-11-11', midMonth)).toBe('2026-11-25');
    expect(creditCardPaymentDate('2026-11-12', midMonth)).toBe('2026-12-25');
    expect(creditCardPaymentDate('2026-12-12', midMonth)).toBe('2027-01-25');
  });

  it('결제일이 그 달에 없으면 말일로 당긴다', () => {
    const rule: BillingRule = { closing_day: 15, payment_day: 31, payment_month_offset: 1 };
    expect(creditCardPaymentDate('2027-01-10', rule)).toBe('2027-02-28');
  });
});

describe('computeCashDate', () => {
  it('신용카드가 아니면 쓴 날이 곧 나간 날', () => {
    expect(computeCashDate('2026-11-13', { type: 'cash', billing: null })).toBe('2026-11-13');
    expect(computeCashDate('2026-11-13', { type: 'check_card', billing: endOfMonth })).toBe('2026-11-13');
    expect(computeCashDate('2026-11-13', { type: 'local_currency', billing: null })).toBe('2026-11-13');
    expect(computeCashDate('2026-11-13', null)).toBe('2026-11-13');
  });

  it('신용카드는 청구 규칙을 따른다', () => {
    expect(computeCashDate('2026-11-13', { type: 'credit_card', billing: endOfMonth })).toBe('2026-12-14');
  });

  it('청구 규칙이 없거나 잘못된 신용카드는 쓴 날로 둔다', () => {
    expect(computeCashDate('2026-11-13', { type: 'credit_card', billing: null })).toBe('2026-11-13');
    const broken = { closing_day: 0, payment_day: 40, payment_month_offset: 1 };
    expect(computeCashDate('2026-11-13', { type: 'credit_card', billing: broken })).toBe('2026-11-13');
  });
});

describe('cashFlows', () => {
  it('일시불은 한 번에', () => {
    expect(cashFlows(100000, '2026-12-14')).toEqual([{ date: '2026-12-14', amount: 100000 }]);
  });

  it('할부는 매달 같은 결제일에 나눠서, 남는 원은 첫 달에', () => {
    const flows = cashFlows(100000, '2026-12-14', 3);
    expect(flows).toEqual([
      { date: '2026-12-14', amount: 33334 },
      { date: '2027-01-14', amount: 33333 },
      { date: '2027-02-14', amount: 33333 },
    ]);
    expect(flows.reduce((s, f) => s + f.amount, 0)).toBe(100000);
  });

  it('31일 결제 할부는 짧은 달에 말일로 당긴다', () => {
    expect(cashFlows(300, '2027-01-31', 3).map((f) => f.date)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
  });
});
