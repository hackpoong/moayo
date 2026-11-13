// 한국 시간(KST, UTC+9, 서머타임 없음) 기준 날짜 계산.
// Date 의 로컬 시간대에 기대지 않으므로 서버(UTC)와 브라우저에서 결과가 같다.

import type { DateString, IsoDateTime } from './types.ts';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const pad = (n: number): string => String(n).padStart(2, '0');

/** 시각을 한국 날짜 'YYYY-MM-DD' 로 바꾼다. */
export function toKstDate(at: IsoDateTime | Date): DateString {
  const d = new Date(new Date(at).getTime() + KST_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 시각을 한국 시간 'HH:mm' 으로 바꾼다. */
export function toKstTime(at: IsoDateTime | Date): string {
  const d = new Date(new Date(at).getTime() + KST_OFFSET_MS);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** 한국 날짜(+시각)를 UTC ISO 시각으로 바꾼다. 시각이 없으면 정오로 둔다(날짜 경계에서 안전). */
export function fromKst(date: DateString, time = '12:00'): IsoDateTime {
  const { y, m, d } = parseDate(date);
  const [hh = 0, mm = 0] = time.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - KST_OFFSET_MS).toISOString();
}

export function todayKst(now: Date = new Date()): DateString {
  return toKstDate(now);
}

export function parseDate(date: DateString): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`invalid date: ${date}`);
  return { y, m, d };
}

export function formatDate(y: number, m: number, d: number): DateString {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** 그 달의 마지막 날(28~31). m 은 1~12. */
export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** (y, m) 에 달을 더한 결과. m 은 1~12. */
export function addMonths(y: number, m: number, delta: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12 + 12) % 12 + 1 };
}

/** 그 달에 없는 날(예: 2월 31일)은 말일로 당긴다. */
export function clampDay(y: number, m: number, day: number): number {
  return Math.min(Math.max(day, 1), daysInMonth(y, m));
}

/** 'YYYY-MM' */
export function monthKey(date: DateString): string {
  return date.slice(0, 7);
}
