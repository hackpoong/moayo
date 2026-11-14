// 여러 내역을 한꺼번에: 고친 뒤 같은 이름 내역 바꾸기, 병합.

import { computeCashDate } from './cashDate.ts';
import { normalizeMerchant } from './ingest/text.ts';
import { toKstDate } from './kst.ts';
import type { PaymentMethod, Split, Transaction, Uuid } from './types.ts';

/** 고친 내역에서 바뀐 칸(제목·분류·자산). 바뀐 것만 다른 내역에 옮긴다. */
export interface RenameChanges {
  merchant?: string | null;
  /** 분류 하나로 정했을 때만. */
  categoryId?: Uuid | null;
  paymentMethodId?: Uuid | null;
}

const singleCategory = (t: Pick<Transaction, 'splits'>) => (t.splits.length === 1 ? t.splits[0]!.category_id : t.splits.length === 0 ? null : undefined);
const isMulti = (t: Pick<Transaction, 'payments'>) => (t.payments?.length ?? 0) > 1;

export function renameChanges(before: Transaction, after: Transaction): RenameChanges {
  const out: RenameChanges = {};
  if ((before.merchant ?? '') !== (after.merchant ?? '')) out.merchant = after.merchant;
  const b = singleCategory(before);
  const a = singleCategory(after);
  if (a !== undefined && a !== b && after.kind !== 'transfer') out.categoryId = a;
  if (!isMulti(after) && after.payment_method_id !== before.payment_method_id) out.paymentMethodId = after.payment_method_id;
  return out;
}

export const hasChanges = (c: RenameChanges) => Object.keys(c).length > 0;

/** 바꾸기 전 이름이 같은 다른 내역: 같은 날 것과 모두. */
export function renameTargets(before: Transaction, all: readonly Transaction[]): { sameDay: Transaction[]; all: Transaction[] } {
  const key = normalizeMerchant(before.merchant);
  if (!key) return { sameDay: [], all: [] };
  const day = toKstDate(before.occurred_at);
  const list = all.filter(
    (t) => t.id !== before.id && !t.deleted_at && t.status !== 'merged' && t.kind === before.kind && normalizeMerchant(t.merchant) === key,
  );
  return { sameDay: list.filter((t) => toKstDate(t.occurred_at) === day), all: list };
}

/** 한 내역에 바뀐 칸을 옮긴다. 자산이 바뀌면 쓴 사람(주인)과 나간 날도 다시 정한다. */
export function applyRename(tx: Transaction, c: RenameChanges, methods: ReadonlyMap<Uuid, PaymentMethod>): Transaction {
  const next: Transaction = { ...tx };
  if ('merchant' in c) next.merchant = c.merchant ?? null;
  if ('categoryId' in c && next.kind !== 'transfer' && next.splits.length <= 1) next.splits = c.categoryId ? [{ category_id: c.categoryId, amount: tx.amount }] : [];
  if ('paymentMethodId' in c && !isMulti(tx)) {
    const pm = c.paymentMethodId ? methods.get(c.paymentMethodId) : undefined;
    next.payment_method_id = c.paymentMethodId ?? null;
    if (pm?.owner_member_id) next.member_id = pm.owner_member_id;
    if (!tx.cash_date_override) next.cash_date = computeCashDate(toKstDate(tx.occurred_at), pm);
    if (pm?.type !== 'credit_card') next.installment_months = 1;
  }
  if (tx.source !== 'manual') next.field_sources = { ...tx.field_sources, user_edited: 'true' };
  return next;
}

const signed = (t: Pick<Transaction, 'kind' | 'amount'>) => (t.kind === 'income' ? t.amount : -t.amount);
const won = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('ko-KR')}원`;

export type MergeResult = { ok: true; merged: Transaction; originals: Transaction[] } | { ok: false; reason: string };

/**
 * 여러 내역을 한 건으로 합친다.
 *  * 금액: 지출 −, 수입 + 로 더한다(취소된 결제는 뺀다). 합이 + 면 수입.
 *  * 제목·분류·날짜·태그: 절대금액이 가장 큰 내역을 따른다(분류 나누기는 비율 유지).
 *  * 자산·쓴 사람이 다르면 자산별 금액으로 남긴다.
 *  * 메모 끝에 합친 내역을 적는다. 원래 내역은 status 'merged' 로 남겨 다시 불러와도 되살아나지 않게 한다.
 */
export function mergeTransactions(txs: readonly Transaction[], newId: Uuid, now: string, leadId?: Uuid): MergeResult {
  if (txs.length < 2) return { ok: false, reason: '두 건 이상 골라 주세요' };
  if (txs.some((t) => t.kind === 'transfer')) return { ok: false, reason: '이체는 합칠 수 없어요' };
  const live = txs.filter((t) => t.status !== 'canceled');
  if (live.length === 0) return { ok: false, reason: '취소된 결제만 골랐어요' };
  const net = live.reduce((s, t) => s + signed(t), 0);
  if (net === 0) return { ok: false, reason: '합치면 0원이 돼요' };
  const amount = Math.abs(net);
  const kind: Transaction['kind'] = net > 0 ? 'income' : 'expense';
  // 기준 내역: 사용자가 고른 것, 없으면 절대금액이 가장 큰 것.
  const lead = (leadId ? txs.find((t) => t.id === leadId) : undefined) ?? [...live].sort((a, b) => b.amount - a.amount)[0]!;

  // 분류: 기준 내역의 분류 비율을 새 금액에 맞춘다. 기준이 반대 종류(예: 지출 합계인데 환불을 골랐을 때)면 같은 종류 중 가장 큰 내역의 분류.
  const sameKind = lead.kind === kind ? lead : [...live].filter((t) => t.kind === kind).sort((a, b) => b.amount - a.amount)[0];
  const leadSplits = sameKind?.splits ?? [];
  let splits: Split[] = [];
  if (leadSplits.length) {
    const total = leadSplits.reduce((s, p) => s + p.amount, 0);
    let used = 0;
    splits = leadSplits.map((p, i) => {
      const a = i === leadSplits.length - 1 ? amount - used : Math.floor((p.amount * amount) / total);
      used += a;
      return { category_id: p.category_id, amount: a };
    });
  }

  // 자산: 자산별 순액. 같은 방향(지출이면 −)으로 남은 몫만 쓴다.
  const byPm = new Map<string, { payment_method_id: Uuid | null; member_id: Uuid | null; amount: number; cash_date: string }>();
  for (const t of live) {
    const parts = (t.payments?.length ?? 0) > 1 ? t.payments! : [{ payment_method_id: t.payment_method_id, member_id: t.member_id, amount: t.amount, cash_date: t.cash_date }];
    for (const p of parts) {
      const k = p.payment_method_id ?? `none-${p.member_id ?? ''}`;
      const cur = byPm.get(k) ?? { payment_method_id: p.payment_method_id, member_id: p.member_id, amount: 0, cash_date: p.cash_date };
      cur.amount += t.kind === 'income' ? p.amount : -p.amount;
      byPm.set(k, cur);
    }
  }
  const dir = kind === 'income' ? 1 : -1;
  let pays = [...byPm.values()].map((p) => ({ ...p, amount: p.amount * dir })).filter((p) => p.amount > 0);
  const paySum = pays.reduce((s, p) => s + p.amount, 0);
  if (pays.length > 1 && paySum !== amount) {
    // 환불이 다른 자산으로 들어온 경우 등: 가장 큰 몫에서 차이를 맞춘다.
    pays.sort((a, b) => b.amount - a.amount);
    pays[0]!.amount += amount - paySum;
    pays = pays.filter((p) => p.amount > 0);
  }
  const primary = pays.length ? [...pays].sort((a, b) => b.amount - a.amount)[0]! : null;

  const others = txs.filter((t) => t.id !== lead.id);
  const note = `합친 내역 : ${others.map((t) => `${t.merchant ?? '이름 없음'} ${t.status === 'canceled' ? '(취소)' : won(signed(t))}`).join(' · ')}`;
  const memo = [lead.memo, note].filter(Boolean).join('\n').slice(0, 500);

  const merged: Transaction = {
    ...lead,
    id: newId,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    kind,
    status: 'confirmed',
    amount,
    original_amount: null,
    memo,
    splits,
    payments: pays.length > 1 ? pays : [],
    payment_method_id: primary?.payment_method_id ?? lead.payment_method_id,
    member_id: primary?.member_id ?? lead.member_id,
    cash_date: primary?.cash_date ?? lead.cash_date,
    installment_months: pays.length > 1 ? 1 : lead.installment_months,
    tag_ids: [...new Set(txs.flatMap((t) => t.tag_ids))],
    source: 'manual',
    field_sources: { merged_from: txs.map((t) => t.id).join(',') },
    linked_tx_id: null,
    review: null,
    approval_no: null,
  };
  const originals = txs.map((t) => ({ ...t, status: 'merged' as const, linked_tx_id: newId, review: null }));
  return { ok: true, merged, originals };
}

/** 병합 풀기: 원래 내역을 되살리고 합친 내역을 지운다. */
export function unmergeTransactions(merged: Transaction, children: readonly Transaction[], now: string): { restored: Transaction[]; removed: Transaction } {
  return {
    restored: children.map((t) => ({ ...t, status: 'confirmed' as const, linked_tx_id: null })),
    removed: { ...merged, deleted_at: now },
  };
}
