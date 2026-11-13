// 후보를 이미 있는 내역과 맞춰 본다.
//  * 같은 결제면 합친다: 빈 칸만 채우고(사용자가 넣은 값은 덮지 않음), 출처를 남긴다.
//  * 애매하면 '확인 필요'로 새로 넣고 의심 대상을 적어 둔다.
//  * 같은 화면에 같은 결제가 여러 번(ATM 30만 원 ×4) 있으면, 이미 있는 개수만큼만 합치고 나머지는 새로 넣는다.

import { computeCashDate } from '../cashDate.ts';
import { toKstDate } from '../kst.ts';
import type { PaymentMethod, Transaction } from '../types.ts';
import { isLocalCurrency } from './normalize.ts';
import { merchantSimilarity } from './text.ts';
import type { Candidate, MatchAction } from './types.ts';

export const MERGE_SCORE = 55;
export const REVIEW_SCORE = 40;

export interface Decision {
  candidate: Candidate;
  action: MatchAction;
  /** 새로 만들거나 고친 내역. duplicate 면 기존 내역 그대로. */
  tx: Transaction;
  /** 합친(또는 의심되는) 기존 내역 id. */
  target_id: string | null;
  filled_fields: string[];
  score: number | null;
  reason: string;
}

export interface MatchContext {
  householdId: string;
  memberId: string | null;
  paymentMethods: PaymentMethod[];
  now: string;
  newId: () => string;
}

const MINUTE = 60_000;

/** 사용자가 직접 넣었거나 고친 내역인지. 이런 내역의 값은 덮어쓰지 않는다. */
export function isUserOwned(tx: Transaction): boolean {
  return tx.source === 'manual' || tx.field_sources?.user_edited === 'true';
}

/** 같은 결제일 가능성 점수. null 이면 절대 같은 결제가 아니다. */
export function scorePair(c: Candidate, t: Transaction, methods: readonly PaymentMethod[]): number | null {
  if (t.deleted_at) return null;
  if (c.approval_no && t.approval_no) return c.approval_no === t.approval_no ? 100 : null;

  const tDate = toKstDate(t.occurred_at);
  // 할인·부분취소 전 금액으로 맞추는 것은 같은 날일 때만(다른 날의 같은 금액 결제와 헷갈리지 않게).
  const amountMatch = c.amount === t.amount || (c.original_amount !== null && c.original_amount === t.amount && tDate === c.date);
  if (!amountMatch) return null;

  let score: number;
  if (c.has_time && t.has_time) {
    const gap = Math.abs(new Date(c.occurred_at).getTime() - new Date(t.occurred_at).getTime());
    if (gap <= 10 * MINUTE) score = 40;
    else if (tDate === c.date) score = -20; // 같은 날 다른 시각: 따로 산 것일 가능성이 크다
    else return null;
  } else if (tDate === c.date) score = 30;
  else {
    // 날짜가 다르면: 손으로 넣은 내역은 하루, 명세서(매입일 기준)는 사흘까지만 봐준다. 캡처끼리는 날짜가 정확하다.
    const gap = Math.abs(daysBetween(tDate, c.date));
    if (t.source === 'manual' && gap <= 1) score = 10;
    else if ((c.source === 'statement' || t.source === 'statement') && gap <= 3) score = 5;
    else return null;
  }

  const cLabeled = !!(c.payment_method_id || c.payment_label);
  const tLabeled = !!(t.payment_method_id || t.payment_label);
  if (c.payment_method_id && t.payment_method_id) {
    if (c.payment_method_id !== t.payment_method_id) return null;
    score += 25;
  } else if (c.payment_label && t.payment_label && !c.payment_method_id && !t.payment_method_id) {
    if (c.payment_label !== t.payment_label) return null;
    score += 25;
  } else if (cLabeled !== tLabeled) {
    score += 10; // 한쪽만 결제수단이 보임: 같은 결제를 다른 앱이 따로 보여 주는 흔한 경우
  }

  const sim = merchantSimilarity(c.merchant, t.merchant);
  if (sim !== null) score += sim >= 0.6 ? 25 : sim < 0.3 ? -10 : 0;

  if (c.kind !== t.kind) score -= 10;

  void methods;
  return score;
}

/** 지역화폐 결제 + 캐시백을 뺀 잔액 차감 줄 관계인지. 'cand-smaller' 면 후보가 작은 쪽(버림), 'tx-smaller' 면 기존이 작은 쪽(고침). */
export function localCurrencyRelation(c: Candidate, t: Transaction, methods: readonly PaymentMethod[]): 'cand-smaller' | 'tx-smaller' | null {
  if (t.deleted_at || c.kind !== 'expense' || t.kind !== 'expense' || c.status !== 'confirmed') return null;
  if (toKstDate(t.occurred_at) !== c.date) return null;
  if ((merchantSimilarity(c.merchant, t.merchant) ?? 0) < 0.85) return null;
  const tLocal = isLocalCurrency({ payment_method_id: t.payment_method_id, payment_label: t.payment_label }, methods);
  const cLocal = isLocalCurrency(c, methods);
  const cUnlabeled = !c.payment_method_id && !c.payment_label;
  const tUnlabeled = !t.payment_method_id && !t.payment_label;
  if (tLocal && cUnlabeled && c.amount < t.amount && c.amount >= t.amount * 0.5) return 'cand-smaller';
  if (cLocal && tUnlabeled && t.amount < c.amount && t.amount >= c.amount * 0.5) return 'tx-smaller';
  return null;
}

function daysBetween(a: string, b: string): number {
  return (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

/** 후보를 순서대로 기존 내역과 맞춘다. 한 기존 내역은 후보 하나에만 합쳐진다. */
export function matchCandidates(candidates: readonly Candidate[], existing: readonly Transaction[], ctx: MatchContext): Decision[] {
  const pool = existing.filter((t) => !t.deleted_at);
  const taken = new Set<string>();
  const decisions: Decision[] = [];
  const createdByIndex = new Map<number, Transaction>();

  // 같은 원문 안의 의심 쌍은 상대 후보가 먼저 들어가야 연결할 수 있으므로 뒤로 미룬다.
  const ordered = [...candidates.filter((c) => c.suspect_of_index === null), ...candidates.filter((c) => c.suspect_of_index !== null)];
  for (const c of ordered) {
    // 1) 지역화폐 잔액 차감 줄
    let localHit: { t: Transaction; rel: 'cand-smaller' | 'tx-smaller' } | null = null;
    for (const t of pool) {
      if (taken.has(t.id)) continue;
      const rel = localCurrencyRelation(c, t, ctx.paymentMethods);
      if (rel) {
        localHit = { t, rel };
        break;
      }
    }
    if (localHit?.rel === 'cand-smaller') {
      // 같은 결제의 다른 표현이라 기존 내역을 차지하지 않는다(같은 화면의 지역화폐 줄도 이 내역과 맞아야 하므로).
      decisions.push({
        candidate: c,
        action: 'duplicate',
        tx: localHit.t,
        target_id: localHit.t.id,
        filled_fields: [],
        score: null,
        reason: '지역화폐 결제의 잔액 차감 줄이라 따로 넣지 않았습니다',
      });
      continue;
    }
    if (localHit?.rel === 'tx-smaller' && !isUserOwned(localHit.t)) {
      taken.add(localHit.t.id);
      decisions.push(merge(c, localHit.t, ctx, null, { correctAmount: true }));
      continue;
    }

    // 2) 일반 맞추기
    let best: { t: Transaction; score: number } | null = null;
    for (const t of pool) {
      if (taken.has(t.id)) continue;
      const score = scorePair(c, t, ctx.paymentMethods);
      if (score !== null && (!best || score > best.score)) best = { t, score };
    }

    if (best && best.score >= MERGE_SCORE) {
      taken.add(best.t.id);
      decisions.push(merge(c, best.t, ctx, best.score, { correctAmount: c.original_amount === best.t.amount }));
      continue;
    }

    const suspectOf = c.suspect_of_index !== null ? createdByIndex.get(c.suspect_of_index) : undefined;
    const reviewTarget = best && best.score >= REVIEW_SCORE ? best.t : suspectOf;
    const tx = createTx(c, ctx, reviewTarget ?? null);
    createdByIndex.set(c.index, tx);
    decisions.push({
      candidate: c,
      action: reviewTarget ? 'review' : 'created',
      tx,
      target_id: reviewTarget?.id ?? null,
      filled_fields: [],
      score: best?.score ?? null,
      reason: reviewTarget ? (tx.review?.reason ?? '') : '새 내역',
    });
  }
  return decisions.sort((a, b) => a.candidate.index - b.candidate.index);
}

function describe(t: Pick<Transaction, 'merchant' | 'amount'>): string {
  return `${t.merchant ?? '이름 없음'} ${t.amount.toLocaleString('ko-KR')}원`;
}

function createTx(c: Candidate, ctx: MatchContext, suspect: Transaction | null): Transaction {
  const method = c.payment_method_id ? ctx.paymentMethods.find((m) => m.id === c.payment_method_id) : null;
  const status = c.status === 'canceled' ? 'canceled' : suspect ? 'review' : 'confirmed';
  return {
    id: ctx.newId(),
    household_id: ctx.householdId,
    created_at: ctx.now,
    updated_at: ctx.now,
    deleted_at: null,
    kind: c.kind,
    status,
    amount: c.amount,
    occurred_at: c.occurred_at,
    has_time: c.has_time,
    cash_date: computeCashDate(c.date, method),
    cash_date_override: false,
    merchant: c.merchant,
    memo: [c.memo, ...c.notes.filter((n) => n.startsWith('부분취소'))].filter(Boolean).join(' · ') || null,
    payment_method_id: c.payment_method_id,
    member_id: method?.owner_member_id ?? ctx.memberId,
    installment_months: method?.type === 'credit_card' ? c.installment_months : 1,
    splits: c.category_id && c.kind !== 'transfer' ? [{ category_id: c.category_id, amount: c.amount }] : [],
    tag_ids: [],
    approval_no: c.approval_no,
    card_last4: c.card_last4,
    items: c.line_items.length ? c.line_items.map((l) => ({ name: l.name, amount: l.amount, ...(l.quantity ? { quantity: l.quantity } : {}) })) : null,
    source: c.source,
    field_sources: {},
    linked_tx_id: null,
    created_by: null,
    payment_label: c.payment_label,
    review: suspect ? { reason: `${describe(suspect)}와 같은 결제일 수 있어요`, duplicate_of: suspect.id } : null,
  };
}

function merge(c: Candidate, t: Transaction, ctx: MatchContext, score: number | null, opts: { correctAmount: boolean }): Decision {
  const next: Transaction = { ...t, field_sources: { ...t.field_sources } };
  const filled: string[] = [];
  const set = <K extends keyof Transaction>(key: K, value: Transaction[K]) => {
    next[key] = value;
    next.field_sources[key as string] = c.source;
    filled.push(key as string);
  };
  const editable = !isUserOwned(t);

  if (!t.merchant && c.merchant) set('merchant', c.merchant);
  if (!t.payment_label && c.payment_label) set('payment_label', c.payment_label);
  if (!t.payment_method_id && c.payment_method_id) {
    set('payment_method_id', c.payment_method_id);
    if (!t.cash_date_override) {
      const method = ctx.paymentMethods.find((m) => m.id === c.payment_method_id);
      next.cash_date = computeCashDate(toKstDate(next.occurred_at), method);
    }
  }
  if (!t.has_time && c.has_time && toKstDate(t.occurred_at) === c.date) {
    set('occurred_at', c.occurred_at);
    next.has_time = true;
  }
  if (!t.approval_no && c.approval_no) set('approval_no', c.approval_no);
  if (!t.card_last4 && c.card_last4) set('card_last4', c.card_last4);
  if (!t.items && c.line_items.length) set('items', c.line_items.map((l) => ({ name: l.name, amount: l.amount, ...(l.quantity ? { quantity: l.quantity } : {}) })));
  if (t.splits.length === 0 && c.category_id && t.kind !== 'transfer' && c.kind === t.kind) set('splits', [{ category_id: c.category_id, amount: t.amount }]);
  if (c.status === 'canceled' && t.status !== 'canceled') set('status', 'canceled');

  if (editable) {
    if (opts.correctAmount && c.amount !== t.amount) {
      set('amount', c.amount);
      next.splits = next.splits.length === 1 ? [{ ...next.splits[0]!, amount: c.amount }] : [];
    }
    if (c.kind === 'transfer' && t.kind !== 'transfer') {
      set('kind', 'transfer');
      next.splits = [];
    }
  }

  const changed = filled.length > 0;
  if (changed) next.updated_at = ctx.now;
  return {
    candidate: c,
    action: changed ? 'merged' : 'duplicate',
    tx: changed ? next : t,
    target_id: t.id,
    filled_fields: filled,
    score,
    reason: changed ? `이미 있는 내역(${describe(t)})에 ${filled.join(', ')} 보충` : `이미 있는 내역(${describe(t)})과 같아 넣지 않았습니다`,
  };
}
