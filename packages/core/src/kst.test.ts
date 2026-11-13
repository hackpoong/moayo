import { describe, expect, it } from 'vitest';
import { addMonths, daysInMonth, fromKst, toKstDate, toKstTime } from './kst.ts';

describe('KST 변환', () => {
  it('UTC 15시는 한국에서 다음 날 0시', () => {
    expect(toKstDate('2026-11-13T15:00:00Z')).toBe('2026-11-14');
    expect(toKstTime('2026-11-13T15:00:00Z')).toBe('00:00');
    expect(toKstDate('2026-11-13T14:59:59Z')).toBe('2026-11-13');
  });

  it('한국 날짜·시각 ↔ UTC 왕복', () => {
    const iso = fromKst('2026-11-13', '08:30');
    expect(iso).toBe('2026-11-12T23:30:00.000Z');
    expect(toKstDate(iso)).toBe('2026-11-13');
    expect(toKstTime(iso)).toBe('08:30');
  });

  it('시각이 없으면 정오', () => {
    expect(toKstTime(fromKst('2026-01-01'))).toBe('12:00');
  });
});

describe('달 계산', () => {
  it('daysInMonth', () => {
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('addMonths 는 연도를 넘나든다', () => {
    expect(addMonths(2026, 12, 1)).toEqual({ y: 2027, m: 1 });
    expect(addMonths(2026, 1, -1)).toEqual({ y: 2025, m: 12 });
    expect(addMonths(2026, 11, 14)).toEqual({ y: 2028, m: 1 });
  });
});
