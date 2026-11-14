import { describe, expect, it } from 'vitest';
import { billingFromDays, billingPeriod, cardStatements, startDayOf } from './cardStatement.ts';
import { makeTx } from './testkit.ts';

describe('카드 청구', () => {
  it('정산일·결제일 → 청구 규칙', () => {
    expect(billingFromDays(1, 1)).toEqual({ closing_day: 31, payment_day: 1, payment_month_offset: 1 });
    expect(billingFromDays(1, 14)).toEqual({ closing_day: 31, payment_day: 14, payment_month_offset: 1 });
    expect(billingFromDays(13, 25)).toEqual({ closing_day: 12, payment_day: 25, payment_month_offset: 0 });
    expect(startDayOf(billingFromDays(13, 25))).toBe(13);
  });
  it('이용기간', () => {
    const rule = billingFromDays(1, 1);
    expect(billingPeriod('2026-11-14', rule)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    const r2 = billingFromDays(13, 25);
    expect(billingPeriod('2026-11-14', r2)).toEqual({ from: '2026-11-13', to: '2026-12-12' });
    expect(billingPeriod('2026-11-12', r2)).toEqual({ from: '2026-10-13', to: '2026-11-12' });
  });
  it('결제예정금액(지난 기간)·미결제금액(지금 기간), 할부·환불 반영', () => {
    const rule = billingFromDays(1, 1);
    const base = { payment_method_id: 'hd', member_id: 'm' };
    const txs = [
      makeTx({ ...base, id: 'a', amount: 30000, occurred_at: '2026-10-05T03:00:00Z', cash_date: '2026-11-01' }),
      makeTx({ ...base, id: 'b', amount: 60000, occurred_at: '2026-10-20T03:00:00Z', cash_date: '2026-11-01', installment_months: 3 }),
      makeTx({ ...base, id: 'c', amount: 5000, occurred_at: '2026-11-03T03:00:00Z', cash_date: '2026-12-01' }),
      makeTx({ ...base, id: 'd', kind: 'income', amount: 2000, occurred_at: '2026-11-04T03:00:00Z', cash_date: '2026-12-01' }),
      makeTx({ ...base, id: 'e', payment_method_id: 'other', amount: 9999, occurred_at: '2026-11-03T03:00:00Z', cash_date: '2026-12-01' }),
    ];
    const [prev, cur] = cardStatements('hd', rule, txs, '2026-11-14');
    expect(prev).toEqual({ from: '2026-10-01', to: '2026-10-31', payDate: '2026-11-01', amount: 50000 });
    expect(cur).toEqual({ from: '2026-11-01', to: '2026-11-30', payDate: '2026-12-01', amount: 5000 - 2000 + 20000 });
  });
});
