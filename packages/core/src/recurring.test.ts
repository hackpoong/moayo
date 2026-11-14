import { describe, expect, it } from 'vitest';
import { groupActivity } from './activity.ts';
import { dueMonths, recurringDate, recurringTransaction, recurringTxId } from './recurring.ts';
import type { ActivityEntry, RecurringRule } from './types.ts';

const rule = (over: Partial<RecurringRule> = {}): RecurringRule => ({
  id: '11111111-2222-4333-8444-555555555555',
  household_id: 'h',
  created_at: '',
  updated_at: '',
  deleted_at: null,
  template: { kind: 'expense', amount: 55000, merchant: '통신비', memo: null, splits: [{ category_id: 'tel', amount: 55000 }], payment_method_id: null, member_id: 'm', tag_ids: [], time: null },
  day_of_month: 25,
  start_month: '2026-09',
  times: null,
  last_generated_month: '2026-09',
  paused: false,
  created_by: null,
  ...over,
});

describe('정기 지출', () => {
  it('오늘까지 빠진 달만', () => {
    expect(dueMonths(rule(), '2026-11-14')).toEqual(['2026-10']);
    expect(dueMonths(rule(), '2026-11-25')).toEqual(['2026-10', '2026-11']);
    expect(dueMonths(rule({ paused: true }), '2026-11-25')).toEqual([]);
  });
  it('횟수 제한', () => {
    expect(dueMonths(rule({ times: 2 }), '2027-03-30')).toEqual(['2026-10']);
  });
  it('없는 날은 말일', () => {
    expect(recurringDate(rule({ day_of_month: 31 }), '2026-02')).toBe('2026-02-28');
  });
  it('같은 규칙·같은 달이면 같은 id(두 기기가 동시에 만들어도 한 건)', () => {
    expect(recurringTxId(rule().id, '2026-10')).toBe(recurringTxId(rule().id, '2026-10'));
    expect(recurringTxId(rule().id, '2026-10')).not.toBe(recurringTxId(rule().id, '2026-11'));
    expect(recurringTxId(rule().id, '2026-10')).toMatch(/^[0-9a-f-]{36}$/);
    const tx = recurringTransaction(rule(), '2026-10', undefined, 'now');
    expect([tx.occurred_at.slice(0, 10), tx.amount, tx.merchant, tx.cash_date]).toEqual(['2026-10-25', 55000, '통신비', '2026-10-25']);
  });
});

describe('기록 묶기', () => {
  const e = (id: string, member: string, action: ActivityEntry['action'], at: string): ActivityEntry =>
    ({ id, household_id: 'h', created_at: at, updated_at: at, deleted_at: null, member_id: member, action, tx_id: id, tx_label: id, kind: 'expense', amount: 1, summary: null }) as ActivityEntry;
  it('같은 사람이 잇달아 불러온 것은 한 줄, 고치기는 따로', () => {
    const g = groupActivity([
      e('a', 'm1', 'import', '2026-11-14T05:00:10Z'),
      e('b', 'm1', 'import', '2026-11-14T05:00:05Z'),
      e('c', 'm1', 'import', '2026-11-14T05:00:00Z'),
      e('d', 'm2', 'update', '2026-11-14T04:00:00Z'),
      e('f', 'm2', 'update', '2026-11-14T03:59:59Z'),
    ]);
    expect(g.map((x) => x.entries.length)).toEqual([3, 1, 1]);
  });
});
