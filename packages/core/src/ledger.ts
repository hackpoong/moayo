// 통계·달력용 집계. 거래 하나를 (날짜, 카테고리, 금액) 조각으로 펼친 뒤 원하는 기준으로 묶는다.
//  * 발생일 기준: 쓴 날 하루에 전액
//  * 현금일 기준: 결제일에, 할부면 매달 나눠서
//  * 취소된 내역과 삭제된 내역은 빠진다. 이체는 kind 가 'transfer' 로 남아서 지출·수입 합계에는 안 들어간다.

import { allocate, paymentsOf } from './allocate.ts';
import { cashFlows } from './cashDate.ts';
import { toKstDate } from './kst.ts';
import type { DateBasis, DateString, Transaction, TransactionKind, Uuid } from './types.ts';

export interface LedgerEntry {
  txId: Uuid;
  kind: TransactionKind;
  date: DateString;
  amount: number;
  categoryId: Uuid | null;
  memberId: Uuid | null;
  paymentMethodId: Uuid | null;
}

export type LedgerTx = Pick<
  Transaction,
  | 'id'
  | 'kind'
  | 'status'
  | 'amount'
  | 'occurred_at'
  | 'cash_date'
  | 'installment_months'
  | 'splits'
  | 'member_id'
  | 'payment_method_id'
  | 'deleted_at'
> &
  Partial<Pick<Transaction, 'payments'>>;

/** 집계에 넣을 내역인지. */
export function isCounted(tx: Pick<Transaction, 'status' | 'deleted_at'>): boolean {
  return tx.deleted_at === null && tx.status !== 'canceled';
}

/**
 * 거래를 기준 날짜별·카테고리별·자산별 조각으로 펼친다. 조각 합계는 항상 거래 금액과 같다.
 * 여러 자산으로 나눠 낸 내역은 분류 몫을 자산 몫 비율대로 나눠, 쓴 사람·자산·나간 날이 자산마다 따로 잡힌다.
 */
export function toEntries(tx: LedgerTx, basis: DateBasis): LedgerEntry[] {
  if (!isCounted(tx)) return [];
  const parts = tx.splits.length > 0 ? tx.splits : [{ category_id: null, amount: tx.amount }];
  const pays = paymentsOf(tx);
  const cells = pays.length === 1 ? parts.map((p) => [p.amount]) : allocate(parts, pays);
  const out: LedgerEntry[] = [];
  const date = toKstDate(tx.occurred_at);
  parts.forEach((p, i) => {
    pays.forEach((q, j) => {
      const amount = cells[i]![j]!;
      if (amount === 0 && (parts.length > 1 || pays.length > 1)) return;
      const base = { txId: tx.id, kind: tx.kind, memberId: q.member_id, paymentMethodId: q.payment_method_id, categoryId: p.category_id };
      if (basis === 'occurred') out.push({ ...base, date, amount });
      else
        for (const flow of cashFlows(amount, pays.length === 1 ? tx.cash_date : q.cash_date, pays.length === 1 ? tx.installment_months : 1))
          out.push({ ...base, date: flow.date, amount: flow.amount });
    });
  });
  return out;
}

export function toAllEntries(txs: readonly LedgerTx[], basis: DateBasis): LedgerEntry[] {
  return txs.flatMap((tx) => toEntries(tx, basis));
}

/** from ≤ date ≤ to 인 조각만. */
export function inRange(entries: readonly LedgerEntry[], from: DateString, to: DateString): LedgerEntry[] {
  return entries.filter((e) => e.date >= from && e.date <= to);
}

export interface Totals {
  income: number;
  expense: number;
  transfer: number;
}

export function totals(entries: readonly LedgerEntry[]): Totals {
  const t: Totals = { income: 0, expense: 0, transfer: 0 };
  for (const e of entries) t[e.kind] += e.amount;
  return t;
}

/** key 별 합계를 큰 순서로. */
export function groupSum<K>(entries: readonly LedgerEntry[], key: (e: LedgerEntry) => K): { key: K; amount: number }[] {
  const map = new Map<K, number>();
  for (const e of entries) map.set(key(e), (map.get(key(e)) ?? 0) + e.amount);
  return [...map.entries()].map(([k, amount]) => ({ key: k, amount })).sort((a, b) => b.amount - a.amount);
}

/** 날짜별 지출·수입 합계 (달력용). */
export function dailyTotals(entries: readonly LedgerEntry[]): Map<DateString, Totals> {
  const map = new Map<DateString, Totals>();
  for (const e of entries) {
    const t = map.get(e.date) ?? { income: 0, expense: 0, transfer: 0 };
    t[e.kind] += e.amount;
    map.set(e.date, t);
  }
  return map;
}

/** 'YYYY-MM' 별 합계 (추이 그래프용). */
export function monthlyTotals(entries: readonly LedgerEntry[]): Map<string, Totals> {
  const map = new Map<string, Totals>();
  for (const e of entries) {
    const key = e.date.slice(0, 7);
    const t = map.get(key) ?? { income: 0, expense: 0, transfer: 0 };
    t[e.kind] += e.amount;
    map.set(key, t);
  }
  return map;
}

/** 그 달의 첫날·마지막 날. */
export function monthRange(month: string): { from: DateString; to: DateString } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/** 'YYYY-MM' 에 달을 더한다. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}
