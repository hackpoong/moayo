import type { Split } from './types.ts';

const formatter = new Intl.NumberFormat('ko-KR');

/** 12345 → "12,345" */
export function formatAmount(amount: number): string {
  return formatter.format(amount);
}

/** 12345 → "12,345원" */
export function formatWon(amount: number): string {
  return `${formatter.format(amount)}원`;
}

/** 큰 금액을 짧게: 1234567 → "123만", 달력 칸처럼 좁은 곳에 쓴다. */
export function formatCompact(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 100_000_000) return `${trimZero(amount / 100_000_000)}억`;
  if (abs >= 10_000) return `${trimZero(amount / 10_000)}만`;
  return formatter.format(amount);
}

function trimZero(n: number): string {
  const fixed = Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1);
  return fixed.replace(/\.0$/, '');
}

/** "12,345원", " 12345 " 같은 입력에서 원 단위 정수를 뽑는다. 숫자가 없으면 null. */
export function parseAmount(input: string): number | null {
  const digits = input.replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}

export function splitsTotal(splits: readonly Split[]): number {
  return splits.reduce((sum, s) => sum + s.amount, 0);
}

/** 분할이 비어 있거나(전액 미분류) 합계가 금액과 같으면 유효. */
export function splitsAreValid(amount: number, splits: readonly Split[]): boolean {
  if (splits.length === 0) return true;
  return splits.every((s) => Number.isInteger(s.amount) && s.amount >= 0) && splitsTotal(splits) === amount;
}
