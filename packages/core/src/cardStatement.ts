// 카드 결제예정금액: 이용기간과 그 기간의 결제일, 그날 빠져나갈 금액.

import { creditCardPaymentDate } from './cashDate.ts';
import { addMonths, clampDay, formatDate, parseDate } from './kst.ts';
import { toAllEntries, type LedgerTx } from './ledger.ts';
import type { BillingRule, DateString, Uuid } from './types.ts';

/** 편한가계부식 입력(정산일 = 이용기간이 시작하는 날, 결제일)을 청구 규칙으로 바꾼다. */
export function billingFromDays(startDay: number, paymentDay: number): BillingRule {
  const closing = startDay <= 1 ? 31 : startDay - 1;
  return { closing_day: closing, payment_day: paymentDay, payment_month_offset: paymentDay > closing ? 0 : 1 };
}

/** 청구 규칙의 정산일(이용기간 시작일). */
export function startDayOf(rule: BillingRule): number {
  return rule.closing_day >= 31 ? 1 : rule.closing_day + 1;
}

function prevDay(date: DateString): DateString {
  const t = new Date(`${date}T00:00:00Z`).getTime() - 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** date 가 속한 이용기간(시작~마감). */
export function billingPeriod(date: DateString, rule: BillingRule): { from: DateString; to: DateString } {
  const { y, m, d } = parseDate(date);
  const end = d <= clampDay(y, m, rule.closing_day) ? { y, m } : addMonths(y, m, 1);
  const to = formatDate(end.y, end.m, clampDay(end.y, end.m, rule.closing_day));
  const prev = addMonths(end.y, end.m, -1);
  const prevClose = formatDate(prev.y, prev.m, clampDay(prev.y, prev.m, rule.closing_day));
  const from = new Date(new Date(`${prevClose}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  return { from, to };
}

export interface Statement {
  from: DateString;
  to: DateString;
  payDate: DateString;
  /** 그 결제일에 이 카드로 빠져나갈 금액(할부·여러 자산 몫 포함, 환불은 뺌). */
  amount: number;
}

/** 지난 이용기간과 지금 이용기간의 청구. [지난 기간, 지금 기간]. */
export function cardStatements(methodId: Uuid, rule: BillingRule, txs: readonly LedgerTx[], today: DateString): [Statement, Statement] {
  const cur = billingPeriod(today, rule);
  const prev = billingPeriod(prevDay(cur.from), rule);
  const entries = toAllEntries(txs, 'cash').filter((e) => e.paymentMethodId === methodId);
  const sumOn = (day: DateString) =>
    entries.reduce((s, e) => s + (e.date !== day ? 0 : e.kind === 'expense' ? e.amount : e.kind === 'income' ? -e.amount : 0), 0);
  const make = (p: { from: DateString; to: DateString }): Statement => {
    const payDate = creditCardPaymentDate(p.to, rule);
    return { ...p, payDate, amount: sumOn(payDate) };
  };
  return [make(prev), make(cur)];
}
