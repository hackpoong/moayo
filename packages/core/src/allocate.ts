// 금액 나누기: 여러 분류·여러 자산으로 나눌 때 원 단위로 정확히 맞춘다.

import type { Payment, Split, Transaction } from './types.ts';

/** total 을 n 개로 똑같이 나눈다. 남는 원은 앞 줄부터 1원씩. */
export function equalSplit(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const rest = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}

/**
 * 직접 고치지 않은 줄들이 (전체 − 고친 줄 합)을 n분의 1씩 나눠 가진다.
 * 줄을 더하거나 빼거나, 전체 금액이 바뀌었을 때 쓴다.
 */
export function rebalance(total: number, amounts: readonly number[], edited: readonly boolean[]): number[] {
  const fixed = amounts.reduce((s, a, i) => s + (edited[i] ? a : 0), 0);
  const free = amounts.map((_, i) => i).filter((i) => !edited[i]);
  const shares = equalSplit(Math.max(0, total - fixed), free.length);
  const out = [...amounts];
  free.forEach((i, k) => (out[i] = shares[k]!));
  return out;
}

/**
 * index 줄을 value 로 고친다. 나머지는 '고치지 않은 줄 중 마지막 줄'이 가져간다.
 * 그런 줄이 없으면 그대로 두고(합이 안 맞으면 화면이 남은 금액을 보여 준다).
 */
export function editAmount(total: number, amounts: readonly number[], edited: readonly boolean[], index: number, value: number): { amounts: number[]; edited: boolean[] } {
  const out = [...amounts];
  const flags = [...edited];
  out[index] = Math.max(0, Math.round(value));
  flags[index] = true;
  let last = -1;
  for (let i = out.length - 1; i >= 0; i--) {
    if (i !== index && !flags[i]) {
      last = i;
      break;
    }
  }
  if (last >= 0) {
    const others = out.reduce((s, a, i) => s + (i === last ? 0 : a), 0);
    out[last] = Math.max(0, total - others);
  }
  return { amounts: out, edited: flags };
}

/** 내역의 자산별 몫. payments 가 없으면 대표 자산 한 곳에서 전액. */
export function paymentsOf(tx: Pick<Transaction, 'payments' | 'payment_method_id' | 'member_id' | 'amount' | 'cash_date'>): Payment[] {
  if (tx.payments && tx.payments.length > 0) return tx.payments;
  return [{ payment_method_id: tx.payment_method_id, member_id: tx.member_id, amount: tx.amount, cash_date: tx.cash_date }];
}

/**
 * 분류 몫 × 자산 몫 표를 원 단위로 채운다. 행(분류) 합과 열(자산) 합이 모두 정확히 맞는다.
 * 앞 자산들은 분류 비율대로 나누고(남는 원은 큰 소수점부터), 마지막 자산이 분류마다 남은 금액을 가져간다.
 */
export function allocate(splits: readonly Pick<Split, 'amount'>[], payments: readonly Pick<Payment, 'amount'>[]): number[][] {
  const total = splits.reduce((s, p) => s + p.amount, 0);
  const cells = splits.map(() => payments.map(() => 0));
  const used = splits.map(() => 0);
  payments.forEach((q, j) => {
    if (j === payments.length - 1) {
      splits.forEach((p, i) => (cells[i]![j] = Math.max(0, p.amount - used[i]!)));
      return;
    }
    const raw = splits.map((p) => (total > 0 ? (p.amount * q.amount) / total : 0));
    const floors = raw.map(Math.floor);
    let rest = q.amount - floors.reduce((s, a) => s + a, 0);
    const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
    for (const { i } of order) {
      if (rest <= 0) break;
      floors[i]! += 1;
      rest -= 1;
    }
    floors.forEach((a, i) => {
      cells[i]![j] = a;
      used[i]! += a;
    });
  });
  return cells;
}
