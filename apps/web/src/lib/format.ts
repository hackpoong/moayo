import { formatAmount, parseDate, todayKst, type DateString, type TransactionKind } from '@moayo/core';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function weekday(date: DateString): string {
  const { y, m, d } = parseDate(date);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]!;
}

/** '11월 13일 (목)' / 오늘·어제는 그렇게 */
export function dayLabel(date: DateString, today = todayKst()): string {
  if (date === today) return `오늘 · ${shortDate(date)}`;
  const { y, m, d } = parseDate(today);
  const yesterday = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  if (date === yesterday) return `어제 · ${shortDate(date)}`;
  return `${shortDate(date)} (${weekday(date)})`;
}

export function shortDate(date: DateString): string {
  const { m, d } = parseDate(date);
  return `${m}월 ${d}일`;
}

export function monthLabel(month: string, thisYear = todayKst().slice(0, 4)): string {
  const [y, m] = month.split('-');
  return y === thisYear ? `${Number(m)}월` : `${y}년 ${Number(m)}월`;
}

/** 지출은 -, 수입은 +, 우리끼리 이체는 부호 없이. */
export function signedAmount(kind: TransactionKind, amount: number): string {
  if (kind === 'expense') return `-${formatAmount(amount)}`;
  if (kind === 'income') return `+${formatAmount(amount)}`;
  return formatAmount(amount);
}

export const KIND_LABEL: Record<TransactionKind, string> = { expense: '지출', income: '수입', transfer: '우리끼리 이체' };

export const KIND_TEXT: Record<TransactionKind, string> = {
  expense: 'text-fg',
  income: 'text-income',
  transfer: 'text-transfer',
};
