import { describe, expect, it } from 'vitest';
import { allocate, editAmount, equalSplit, paymentsOf, rebalance } from './allocate.ts';
import { toEntries, groupSum } from './ledger.ts';
import { makeTx } from './testkit.ts';

describe('금액 나누기', () => {
  it('n분의 1, 남는 원은 앞 줄부터', () => {
    expect(equalSplit(7000, 3)).toEqual([2334, 2333, 2333]);
    expect(equalSplit(0, 2)).toEqual([0, 0]);
    expect(equalSplit(100, 0)).toEqual([]);
  });

  it('고치지 않은 줄들이 나머지를 나눠 가진다(줄 추가·전체 금액 변경)', () => {
    expect(rebalance(10000, [1000, 0, 0], [true, false, false])).toEqual([1000, 4500, 4500]);
    expect(rebalance(9000, [0, 0, 0], [false, false, false])).toEqual([3000, 3000, 3000]);
  });

  it('한 줄을 고치면 고치지 않은 줄 중 마지막 줄이 나머지를 가져간다', () => {
    const r = editAmount(7000, [2334, 2333, 2333], [false, false, false], 0, 1000);
    expect(r.amounts).toEqual([1000, 2333, 3667]);
    expect(r.edited).toEqual([true, false, false]);
    // 마지막 줄을 고치면 그 앞의 고치지 않은 줄이 가져간다
    const r2 = editAmount(7000, r.amounts, r.edited, 2, 5000);
    expect(r2.amounts).toEqual([1000, 1000, 5000]);
    // 모두 고친 뒤엔 그대로(합이 안 맞으면 화면이 남은 금액 표시)
    const r3 = editAmount(7000, r2.amounts, r2.edited, 1, 500);
    expect(r3.amounts).toEqual([1000, 500, 5000]);
  });
});

describe('분류 × 자산 표', () => {
  it('행 합(분류)과 열 합(자산)이 모두 정확히 맞는다', () => {
    const splits = [{ amount: 2000 }, { amount: 5000 }];
    const pays = [{ amount: 3000 }, { amount: 4000 }];
    const cells = allocate(splits, pays);
    expect(cells.map((r) => r[0]! + r[1]!)).toEqual([2000, 5000]);
    expect([cells[0]![0]! + cells[1]![0]!, cells[0]![1]! + cells[1]![1]!]).toEqual([3000, 4000]);
  });
  it('나누어떨어지지 않아도 맞는다', () => {
    const splits = [{ amount: 333 }, { amount: 333 }, { amount: 334 }];
    const pays = [{ amount: 101 }, { amount: 899 }];
    const cells = allocate(splits, pays);
    expect(cells.map((r) => r.reduce((a, b) => a + b, 0))).toEqual([333, 333, 334]);
    expect(pays.map((_, j) => cells.reduce((s, r) => s + r[j]!, 0))).toEqual([101, 899]);
  });
});

describe('자산별 금액이 있는 내역의 집계', () => {
  const tx = makeTx({
    id: 't1',
    amount: 7000,
    occurred_at: '2026-11-14T03:00:00Z',
    cash_date: '2026-12-14',
    member_id: 'm-b',
    payment_method_id: 'card',
    splits: [
      { category_id: 'living', amount: 2000 },
      { category_id: 'food', amount: 5000 },
    ],
    payments: [
      { payment_method_id: 'card', member_id: 'm-b', amount: 3000, cash_date: '2026-12-14' },
      { payment_method_id: 'cash', member_id: 'm-a', amount: 4000, cash_date: '2026-11-14' },
    ],
  });
  it('쓴 사람별·자산별 합계는 자산 몫대로', () => {
    const es = toEntries(tx, 'occurred');
    expect(groupSum(es, (e) => e.memberId)).toEqual(expect.arrayContaining([{ key: 'm-b', amount: 3000 }, { key: 'm-a', amount: 4000 }]));
    expect(groupSum(es, (e) => e.categoryId)).toEqual(expect.arrayContaining([{ key: 'living', amount: 2000 }, { key: 'food', amount: 5000 }]));
  });
  it('나간 날 기준이면 몫마다 자기 결제일에', () => {
    const es = toEntries(tx, 'cash');
    expect(groupSum(es, (e) => e.date)).toEqual(expect.arrayContaining([{ key: '2026-12-14', amount: 3000 }, { key: '2026-11-14', amount: 4000 }]));
  });
  it('payments 가 없으면 대표 자산 한 곳', () => {
    expect(paymentsOf({ ...tx, payments: [] })).toEqual([{ payment_method_id: 'card', member_id: 'm-b', amount: 7000, cash_date: '2026-12-14' }]);
  });
});
