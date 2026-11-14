// 숫자패드 계산식: '12000+3500-500' 같은 덧셈·뺄셈만. 결과는 0 이상 정수, 틀린 식이면 null.

export function evalAmountExpression(expr: string): number | null {
  const s = expr.replace(/[,\s]/g, '');
  if (!s) return null;
  if (!/^\d+([+-]\d+)*[+-]?$/.test(s)) return null;
  const trimmed = s.replace(/[+-]$/, '');
  let total = 0;
  for (const m of trimmed.matchAll(/([+-]?)(\d+)/g)) total += (m[1] === '-' ? -1 : 1) * Number(m[2]);
  if (!Number.isSafeInteger(total)) return null;
  return Math.max(0, total);
}

/** 화면용: '12000+3500' → '12,000 + 3,500' */
export function formatAmountExpression(expr: string): string {
  return expr.replace(/\d+/g, (d) => Number(d).toLocaleString('ko-KR')).replace(/([+-])/g, ' $1 ');
}

export function hasOperator(expr: string): boolean {
  return /\d[+-]/.test(expr);
}
