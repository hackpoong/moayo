// 싼 모델이 읽은 결과가 미심쩍은지 본다. 미심쩍을 때만 비싼 모델로 다시 읽는다(AI 비용 줄이기).

import type { Extraction } from './types.ts';

/** 가게 이름 자리에 잘못 들어가기 쉬운 화면 글자. */
const JUNK_MERCHANT = /^(결제|결제완료|결제취소|부분취소|가맹점|상품|주문|구매확정완료|배송완료|승인|취소|내역|이용내역|합계|총액|-|\?|null|undefined)$/i;

export interface QualityIssue {
  index: number | null;
  reason: string;
}

/** 다시 읽어야 할 이유들. 비어 있으면 그대로 써도 된다. */
export function extractionIssues(ex: Extraction, today: string, opts: { isImage: boolean }): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (opts.isImage && ex.items.length === 0) issues.push({ index: null, reason: '거래를 하나도 찾지 못함' });
  const min = shiftDays(today, -400);
  const max = shiftDays(today, 1);
  ex.items.forEach((item, index) => {
    const merchant = item.merchant.trim();
    if (JUNK_MERCHANT.test(merchant.replace(/\s/g, '')) || merchant.length > 80) issues.push({ index, reason: `가게 이름이 이상함: ${merchant}` });
    if (!item.date) issues.push({ index, reason: '날짜 없음' });
    else if (item.date < min || item.date > max) issues.push({ index, reason: `날짜가 이상함: ${item.date}` });
    if (item.original_amount !== null && item.original_amount < item.amount && item.status !== 'partial_canceled')
      issues.push({ index, reason: '할인 전 금액이 최종 금액보다 작음' });
    if (item.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time)) issues.push({ index, reason: `시각이 이상함: ${item.time}` });
  });
  return issues;
}

function shiftDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
