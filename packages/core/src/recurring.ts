// 정기 지출: 앱을 열 때 오늘까지 빠진 달의 내역을 만든다.
// 내역 id 를 규칙 id + 연월로 정해서, 두 사람이 동시에 열어도 한 번만 생긴다.

import { computeCashDate } from './cashDate.ts';
import { addMonths, clampDay, formatDate, fromKst } from './kst.ts';
import type { PaymentMethod, RecurringRule, Transaction, Uuid } from './types.ts';

/** 규칙 id 와 연월로 정해지는 내역 id(같은 규칙·같은 달이면 늘 같다). */
export function recurringTxId(ruleId: Uuid, month: string): Uuid {
  const tag = month.replace('-', '').padStart(12, '0');
  return `${ruleId.slice(0, 24)}${tag}`;
}

const nextMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const n = addMonths(y, m, 1);
  return `${n.y}-${String(n.m).padStart(2, '0')}`;
};
const monthsBetween = (a: string, b: string) => {
  const [ay, am] = a.split('-').map(Number) as [number, number];
  const [by, bm] = b.split('-').map(Number) as [number, number];
  return (by - ay) * 12 + (bm - am);
};

/** 그 달의 반복 날짜(없는 날이면 말일). */
export function recurringDate(rule: Pick<RecurringRule, 'day_of_month'>, month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return formatDate(y, m, clampDay(y, m, rule.day_of_month));
}

/** 오늘까지 만들어야 하는 달들(아직 안 만든 것만). */
export function dueMonths(rule: RecurringRule, today: string): string[] {
  if (rule.paused || rule.deleted_at) return [];
  const out: string[] = [];
  let month = rule.last_generated_month ? nextMonth(rule.last_generated_month) : rule.start_month;
  while (recurringDate(rule, month) <= today) {
    if (rule.times !== null && monthsBetween(rule.start_month, month) >= rule.times) break;
    out.push(month);
    month = nextMonth(month);
    if (out.length > 60) break;
  }
  return out;
}

/** 규칙과 달로 내역을 만든다. */
export function recurringTransaction(rule: RecurringRule, month: string, method: PaymentMethod | undefined, now: string): Transaction {
  const t = rule.template;
  const date = recurringDate(rule, month);
  return {
    id: recurringTxId(rule.id, month),
    household_id: rule.household_id,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    kind: t.kind,
    status: 'confirmed',
    amount: t.amount,
    original_amount: null,
    occurred_at: fromKst(date, t.time ?? '12:00'),
    has_time: !!t.time,
    cash_date: computeCashDate(date, method),
    cash_date_override: false,
    merchant: t.merchant,
    memo: t.memo,
    payment_method_id: t.payment_method_id,
    member_id: method?.owner_member_id ?? t.member_id,
    installment_months: 1,
    splits: t.splits,
    payments: [],
    tag_ids: t.tag_ids,
    approval_no: null,
    card_last4: null,
    items: null,
    source: 'manual',
    field_sources: { recurring_rule: rule.id },
    linked_tx_id: null,
    created_by: null,
    payment_label: null,
    review: null,
  };
}
