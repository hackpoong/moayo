import { computeCashDate, fromKst, toKstTime, type PaymentMethod, type Transaction } from '@moayo/core';
import { newId } from '../data/mutations.ts';

/** 날짜만 바꾼다(시각은 그대로). 나간 날도 자산마다 다시 계산한다(직접 정한 날은 그대로). */
export function withDate(tx: Transaction, date: string, methods: ReadonlyMap<string, PaymentMethod>): Transaction {
  const next: Transaction = { ...tx, occurred_at: fromKst(date, tx.has_time ? toKstTime(tx.occurred_at) : '12:00') };
  if (tx.cash_date_override) return next;
  const pm = (id: string | null) => (id ? methods.get(id) : undefined);
  if ((tx.payments?.length ?? 0) > 1) {
    next.payments = tx.payments!.map((p) => ({ ...p, cash_date: computeCashDate(date, pm(p.payment_method_id)) }));
    next.cash_date = next.payments.find((p) => p.payment_method_id === tx.payment_method_id)?.cash_date ?? date;
  } else next.cash_date = computeCashDate(date, pm(tx.payment_method_id));
  return next;
}

/** 복제: 새 내역으로, 직접 넣은 것처럼. */
export function duplicate(tx: Transaction, date: string, methods: ReadonlyMap<string, PaymentMethod>): Transaction {
  const now = new Date().toISOString();
  return withDate(
    {
      ...tx,
      id: newId(),
      created_at: now,
      updated_at: now,
      deleted_at: null,
      status: 'confirmed',
      source: 'manual',
      field_sources: {},
      linked_tx_id: null,
      review: null,
      approval_no: null,
      created_by: null,
      cash_date_override: false,
    },
    date,
    methods,
  );
}
