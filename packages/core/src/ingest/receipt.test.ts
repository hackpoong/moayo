import { describe, expect, it } from 'vitest';
import { makeTx } from '../testkit.ts';
import type { Member, PaymentMethod } from '../types.ts';
import { coerceExtraction } from './coerce.ts';
import { matchCandidates } from './match.ts';
import { DEFAULT_ASSET_MARK } from '../defaultAssets.ts';
import { normalizeExtraction, type NormalizeContext } from './normalize.ts';
import { extractionIssues } from './quality.ts';

const pm = (id: string, name: string, type: PaymentMethod['type'], extra: Partial<PaymentMethod> = {}): PaymentMethod => ({
  id,
  household_id: 'h',
  created_at: '',
  updated_at: '',
  deleted_at: null,
  name,
  type,
  issuer: null,
  last4: null,
  owner_member_id: null,
  aliases: [],
  billing: null,
  color: null,
  sort: 0,
  archived: false,
  ...extra,
});
// 가짜 이름만 쓴다. m-1 은 카드 주인, m-2 는 마일리지 회원(영수증에는 '김*수'로 찍힘).
const members = [
  { id: 'm-1', household_id: 'h', display_name: '가', emoji: '💙', aliases: ['이영희'], deleted_at: null },
  { id: 'm-2', household_id: 'h', display_name: '나', emoji: '💛', aliases: ['김민수'], deleted_at: null },
] as Pick<Member, 'id' | 'household_id' | 'display_name' | 'emoji' | 'aliases' | 'deleted_at'>[];
const methods = [
  pm('pm-card', '테스트프리미엄', 'credit_card', { owner_member_id: 'm-1', card_number: '4111223344559931', last4: '9931' }),
  ...(['m-1', 'm-2'] as const).flatMap((who) => [
    pm(`cash-${who}`, '현금', 'other', { owner_member_id: who, issuer: DEFAULT_ASSET_MARK.cash }),
    pm(`point-${who}`, '포인트·마일리지', 'other', { owner_member_id: who, issuer: DEFAULT_ASSET_MARK.point }),
    pm(`voucher-${who}`, '상품권', 'other', { owner_member_id: who, issuer: DEFAULT_ASSET_MARK.voucher }),
  ]),
];
const ctx: NormalizeContext = { source: 'image', paymentMethods: methods, transferRules: [], categories: [], history: [], fallbackDate: '2026-11-14', members, memberId: 'm-1' };
const matchCtx = { householdId: 'h', memberId: 'm-1', paymentMethods: methods, now: 'now', newId: () => 'n1' };

// 카드 + 상품권 + 마일리지로 나눠 낸 가구점 영수증을 AI 가 이렇게 읽었다고 하자.
const receipt = (over: Record<string, unknown> = {}) =>
  coerceExtraction({
    source_kind: 'receipt',
    items: [
      {
        date: '2026-10-30',
        time: '19:31',
        merchant: '가구점 세종점',
        amount: 2581300,
        original_amount: 3110000,
        kind: 'expense',
        status: 'approved',
        payment_label: '테스트프리미엄',
        card_last4: '993*',
        card_number_hint: '41112233****993*',
        approval_no: '00000001',
        tenders: [
          { kind: 'card', label: '테스트프리미엄', amount: 2471300, card_number_hint: '41112233****993*', holder: null },
          { kind: 'voucher', label: '백화점상품권', amount: 100000, card_number_hint: null, holder: null },
          { kind: 'point', label: '마일리지사용', amount: -10000, card_number_hint: null, holder: '김*수' },
        ],
        ...over,
      },
    ],
  });

describe('여러 결제수단 영수증', () => {
  it('총액 2,581,300 = 카드 2,471,300 + 상품권 100,000 + 마일리지 10,000', () => {
    const ex = receipt();
    expect(ex.items[0]!.card_last4).toBeNull(); // '993*' 은 끝자리가 아니다
    expect(extractionIssues(ex, '2026-11-14', { isImage: true })).toEqual([]);
    const [c] = normalizeExtraction(ex, ctx);
    expect(c!.amount).toBe(2581300);
    expect(c!.payments!.map((p) => [p.payment_method_id, p.member_id, p.amount])).toEqual([
      ['pm-card', 'm-1', 2471300],
      ['voucher-m-1', 'm-1', 100000],
      ['point-m-2', 'm-2', 10000], // 마일리지 회원 김*수 → m-2
    ]);
    expect(c!.payment_method_id).toBe('pm-card');
    expect(c!.memo).toContain('결제 : 테스트프리미엄 2,471,300원 · 백화점상품권 100,000원 · 마일리지사용 10,000원');
    expect(c!.memo).not.toContain('원래 금액');
  });

  it('카드 금액만 총액으로 적으면 다시 읽기', () => {
    const issues = extractionIssues(receipt({ amount: 2471300 }), '2026-11-14', { isImage: true });
    expect(issues.map((i) => i.reason)).toContain('결제수단별 금액 합이 총액과 다름');
  });

  it('새 내역은 자산별 몫으로 저장', () => {
    const [d] = matchCandidates(normalizeExtraction(receipt(), ctx), [], matchCtx);
    expect(d!.action).toBe('created');
    expect([d!.tx.amount, d!.tx.payments!.length, d!.tx.payment_method_id, d!.tx.member_id]).toEqual([2581300, 3, 'pm-card', 'm-1']);
  });

  it('먼저 들어온 카드 문자(2,471,300)에 몫과 총액을 채운다', () => {
    const sms = makeTx({ id: 'sms', merchant: '가구점', amount: 2471300, occurred_at: '2026-10-30T10:31:00Z', has_time: true, source: 'sms', payment_method_id: 'pm-card', member_id: 'm-1' });
    const [d] = matchCandidates(normalizeExtraction(receipt({ approval_no: null }), ctx), [sms], matchCtx);
    expect(d!.action).toBe('merged');
    expect([d!.tx.id, d!.tx.amount, d!.tx.payments!.length]).toEqual(['sms', 2581300, 3]);
  });
});

describe('가려진 이름', () => {
  it('김*수 ↔ 김민수', async () => {
    const { maskedNameMatches } = await import('../card.ts');
    expect(maskedNameMatches('김*수', '김민수')).toBe(true);
    expect(maskedNameMatches('김*수', '이영희')).toBe(false);
    expect(maskedNameMatches('***', '김민수')).toBe(false);
  });
});
