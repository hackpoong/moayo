import { describe, expect, it } from 'vitest';
import { dailyTotals, groupSum, inRange, monthRange, shiftMonth, toAllEntries, toEntries, totals } from './ledger.ts';
import { makeTx } from './testkit.ts';

describe('toEntries', () => {
  it('발생일 기준은 한국 날짜 하루에 전액', () => {
    // UTC 11-13 15:30 = 한국 11-14 00:30
    const tx = makeTx({ amount: 5000, occurred_at: '2026-11-13T15:30:00Z', cash_date: '2026-12-14' });
    expect(toEntries(tx, 'occurred')).toEqual([expect.objectContaining({ date: '2026-11-14', amount: 5000, categoryId: null })]);
    expect(toEntries(tx, 'cash')).toEqual([expect.objectContaining({ date: '2026-12-14', amount: 5000 })]);
  });

  it('분할은 카테고리별 조각이 된다', () => {
    const tx = makeTx({
      amount: 100000,
      splits: [
        { category_id: 'food', amount: 50000 },
        { category_id: 'clothes', amount: 50000 },
      ],
    });
    const entries = toEntries(tx, 'occurred');
    expect(entries.map((e) => [e.categoryId, e.amount])).toEqual([
      ['food', 50000],
      ['clothes', 50000],
    ]);
  });

  it('할부는 현금일 기준에서 달마다 나뉘고, 조각 합계는 금액과 같다', () => {
    const tx = makeTx({
      amount: 100000,
      cash_date: '2026-12-14',
      installment_months: 3,
      splits: [
        { category_id: 'a', amount: 70000 },
        { category_id: 'b', amount: 30000 },
      ],
    });
    const entries = toEntries(tx, 'cash');
    expect(entries.reduce((s, e) => s + e.amount, 0)).toBe(100000);
    expect([...new Set(entries.map((e) => e.date))]).toEqual(['2026-12-14', '2027-01-14', '2027-02-14']);
    // 발생일 기준은 할부와 상관없이 한 번
    expect(toEntries(tx, 'occurred')).toHaveLength(2);
  });

  it('취소·삭제된 내역은 빠진다', () => {
    expect(toEntries(makeTx({ status: 'canceled' }), 'occurred')).toEqual([]);
    expect(toEntries(makeTx({ deleted_at: '2026-11-13T00:00:00Z' }), 'occurred')).toEqual([]);
  });
});

describe('집계', () => {
  const txs = [
    makeTx({ kind: 'expense', amount: 3000, occurred_at: '2026-11-01T03:00:00Z', member_id: 'mom' }),
    makeTx({ kind: 'expense', amount: 7000, occurred_at: '2026-11-01T05:00:00Z', member_id: 'dad' }),
    makeTx({ kind: 'income', amount: 50000, occurred_at: '2026-11-02T03:00:00Z' }),
    makeTx({ kind: 'transfer', amount: 20000, occurred_at: '2026-11-02T03:00:00Z' }),
    makeTx({ kind: 'expense', amount: 1000, occurred_at: '2026-12-01T03:00:00Z' }),
  ];
  const entries = toAllEntries(txs, 'occurred');

  it('이체는 지출·수입과 따로 모인다', () => {
    const { from, to } = monthRange('2026-11');
    expect(totals(inRange(entries, from, to))).toEqual({ income: 50000, expense: 10000, transfer: 20000 });
  });

  it('날짜별', () => {
    const daily = dailyTotals(entries);
    expect(daily.get('2026-11-01')).toEqual({ income: 0, expense: 10000, transfer: 0 });
  });

  it('구성원별은 큰 순서로', () => {
    const byMember = groupSum(
      entries.filter((e) => e.kind === 'expense' && e.date < '2026-12-01'),
      (e) => e.memberId,
    );
    expect(byMember).toEqual([
      { key: 'dad', amount: 7000 },
      { key: 'mom', amount: 3000 },
    ]);
  });
});

describe('달 계산', () => {
  it('monthRange', () => {
    expect(monthRange('2027-02')).toEqual({ from: '2027-02-01', to: '2027-02-28' });
  });
  it('shiftMonth', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});
