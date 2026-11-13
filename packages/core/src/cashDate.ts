// "실제 현금이 나간 날" 계산.
//  * 현금·체크카드·계좌·선불수단: 쓴 날 = 나간 날
//  * 신용카드: 이용기간 마감일과 결제일 규칙으로 계산
//  * 할부: 첫 결제일부터 매달 같은 결제일에 나눠서 나간다

import { addMonths, clampDay, formatDate, parseDate } from './kst.ts';
import type { BillingRule, DateString, PaymentMethod } from './types.ts';

export function isValidBillingRule(rule: BillingRule): boolean {
  const inRange = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi;
  return (
    inRange(rule.closing_day, 1, 31) && inRange(rule.payment_day, 1, 31) && inRange(rule.payment_month_offset, 0, 3)
  );
}

/** 신용카드로 occurred 날짜에 쓴 금액이 청구되는 날. */
export function creditCardPaymentDate(occurred: DateString, rule: BillingRule): DateString {
  const { y, m, d } = parseDate(occurred);
  // 이 사용분이 속한 이용기간의 마감 월: 이번 달 마감일을 넘겼으면 다음 달 마감분이다.
  const closing = d <= clampDay(y, m, rule.closing_day) ? { y, m } : addMonths(y, m, 1);
  const pay = addMonths(closing.y, closing.m, rule.payment_month_offset);
  return formatDate(pay.y, pay.m, clampDay(pay.y, pay.m, rule.payment_day));
}

type MethodForCashDate = Pick<PaymentMethod, 'type' | 'billing'>;

/** 발생일과 결제수단으로 현금일을 구한다. 결제수단을 모르면 발생일과 같다고 본다. */
export function computeCashDate(occurred: DateString, method: MethodForCashDate | null | undefined): DateString {
  if (method?.type === 'credit_card' && method.billing && isValidBillingRule(method.billing)) {
    return creditCardPaymentDate(occurred, method.billing);
  }
  return occurred;
}

export interface CashFlow {
  date: DateString;
  amount: number;
}

/**
 * 한 거래가 현금일 기준으로 언제 얼마씩 나가는지.
 * 일시불이면 1건, 할부면 개월 수만큼. 나누어떨어지지 않는 원 단위는 첫 달에 붙인다.
 */
export function cashFlows(amount: number, firstCashDate: DateString, installmentMonths = 1): CashFlow[] {
  const months = Math.max(1, Math.floor(installmentMonths));
  if (months === 1) return [{ date: firstCashDate, amount }];

  const { y, m, d } = parseDate(firstCashDate);
  const base = Math.floor(amount / months);
  const remainder = amount - base * months;
  return Array.from({ length: months }, (_, i) => {
    const at = addMonths(y, m, i);
    return {
      date: formatDate(at.y, at.m, clampDay(at.y, at.m, d)),
      amount: i === 0 ? base + remainder : base,
    };
  });
}
