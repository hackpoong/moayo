import { describe, expect, it } from 'vitest';
import { applyRename, mergeTransactions, renameChanges, renameTargets } from './bulk.ts';
import { makeTx } from './testkit.ts';
import type { PaymentMethod } from './types.ts';

const pm = (id: string, over: Partial<PaymentMethod> = {}): PaymentMethod =>
  ({ id, household_id: 'h', created_at: '', updated_at: '', deleted_at: null, name: id, type: 'cash', issuer: null, last4: null, owner_member_id: null, aliases: [], billing: null, color: null, sort: 0, archived: false, ...over }) as PaymentMethod;

describe('고친 뒤 같은 이름 내역 바꾸기', () => {
  const a = makeTx({ id: 'a', merchant: '에브리포터블', amount: 800, occurred_at: '2026-11-14T03:00:00Z', source: 'screenshot' });
  const b = makeTx({ id: 'b', merchant: '에브리 포터블', amount: 1600, occurred_at: '2026-11-14T04:00:00Z', source: 'screenshot' });
  const c = makeTx({ id: 'c', merchant: '에브리포터블', amount: 200, occurred_at: '2026-11-10T04:00:00Z', source: 'screenshot' });
  const d = makeTx({ id: 'd', merchant: '다른가게', amount: 5000, occurred_at: '2026-11-14T04:00:00Z' });

  it('바뀐 칸만', () => {
    const after = { ...a, merchant: '휴대폰충전', splits: [{ category_id: 'etc', amount: 800 }], payment_method_id: 'kakao' };
    expect(renameChanges(a, after)).toEqual({ merchant: '휴대폰충전', categoryId: 'etc', paymentMethodId: 'kakao' });
    expect(renameChanges(a, { ...a, memo: 'x' })).toEqual({});
  });
  it('같은 날 / 모든 내역(띄어쓰기 무시)', () => {
    const t = renameTargets(a, [a, b, c, d]);
    expect(t.sameDay.map((x) => x.id)).toEqual(['b']);
    expect(t.all.map((x) => x.id)).toEqual(['b', 'c']);
  });
  it('자산이 바뀌면 쓴 사람·나간 날도', () => {
    const methods = new Map([['card', pm('card', { type: 'credit_card', owner_member_id: 'm-b', billing: { closing_day: 31, payment_day: 14, payment_month_offset: 1 } })]]);
    const r = applyRename(c, { merchant: '휴대폰충전', categoryId: 'etc', paymentMethodId: 'card' }, methods);
    expect([r.merchant, r.splits, r.payment_method_id, r.member_id, r.cash_date, r.field_sources.user_edited]).toEqual([
      '휴대폰충전',
      [{ category_id: 'etc', amount: 200 }],
      'card',
      'm-b',
      '2026-12-14',
      'true',
    ]);
  });
});

describe('병합', () => {
  it('−800 −1,600 −200(취소) → 지출 2,400', () => {
    const txs = [
      makeTx({ id: 'x1', merchant: '에브리포터블', amount: 800, payment_method_id: 'kakao' }),
      makeTx({ id: 'x2', merchant: '에브리포터블', amount: 1600, payment_method_id: 'kakao' }),
      makeTx({ id: 'x3', merchant: '에브리포터블', amount: 200, status: 'canceled', payment_method_id: 'kakao' }),
    ];
    const r = mergeTransactions(txs, 'new', 'now');
    if (!r.ok) throw new Error(r.reason);
    expect([r.merged.kind, r.merged.amount, r.merged.payment_method_id, r.merged.payments]).toEqual(['expense', 2400, 'kakao', []]);
    expect(r.merged.memo).toBe('합친 내역 : 에브리포터블 −800원 · 에브리포터블 (취소)');
    expect(r.originals.every((t) => t.status === 'merged' && t.linked_tx_id === 'new')).toBe(true);
  });
  it('이마트 −200,000 · 주차 −3,000 · 환불 +20,000 → 이마트 지출 183,000, 분류는 큰 쪽', () => {
    const txs = [
      makeTx({ id: 'e1', merchant: '이마트', amount: 200000, splits: [{ category_id: 'food', amount: 150000 }, { category_id: 'living', amount: 50000 }], payment_method_id: 'card', member_id: 'm-a' }),
      makeTx({ id: 'e2', merchant: '이마트주차', amount: 3000, payment_method_id: 'cash', member_id: 'm-b', splits: [{ category_id: 'car', amount: 3000 }] }),
      makeTx({ id: 'e3', merchant: '이마트환불', kind: 'income', amount: 20000, payment_method_id: 'card', member_id: 'm-a' }),
    ];
    const r = mergeTransactions(txs, 'new', 'now');
    if (!r.ok) throw new Error(r.reason);
    expect([r.merged.merchant, r.merged.kind, r.merged.amount]).toEqual(['이마트', 'expense', 183000]);
    expect(r.merged.splits).toEqual([{ category_id: 'food', amount: 137250 }, { category_id: 'living', amount: 45750 }]);
    expect(r.merged.payments?.map((p) => [p.payment_method_id, p.member_id, p.amount])).toEqual([
      ['card', 'm-a', 180000],
      ['cash', 'm-b', 3000],
    ]);
    expect(r.merged.memo).toContain('합친 내역 : 이마트주차 −3,000원 · 이마트환불 +20,000원');
  });
  it('기준 내역을 고르면 그 제목·분류를 따른다', () => {
    const txs = [
      makeTx({ id: 'e1', merchant: '이마트', amount: 200000, splits: [{ category_id: 'food', amount: 200000 }] }),
      makeTx({ id: 'e2', merchant: '이마트주차', amount: 3000, splits: [{ category_id: 'car', amount: 3000 }] }),
    ];
    const r = mergeTransactions(txs, 'n', 'now', 'e2');
    if (!r.ok) throw new Error(r.reason);
    expect([r.merged.merchant, r.merged.amount, r.merged.splits]).toEqual(['이마트주차', 203000, [{ category_id: 'car', amount: 203000 }]]);
    expect(r.merged.memo).toContain('합친 내역 : 이마트 −200,000원');
  });
  it('합이 + 면 수입, 이체는 거부', () => {
    const r = mergeTransactions([makeTx({ kind: 'income', amount: 5000 }), makeTx({ amount: 1000 })], 'n', 'now');
    expect(r.ok && r.merged.kind).toBe('income');
    expect(mergeTransactions([makeTx({ kind: 'transfer' }), makeTx()], 'n', 'now').ok).toBe(false);
  });
});
