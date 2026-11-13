import { describe, expect, it } from 'vitest';
import { matchesFilter } from './search.ts';
import { makeTx } from './testkit.ts';

const lookup = {
  categoryName: (id: string) => ({ food: '식비', clothes: '의류' })[id],
  tagName: (id: string) => ({ trip: '제주여행' })[id],
  paymentMethodName: (id: string) => ({ bc: 'BC카드' })[id],
};

describe('matchesFilter', () => {
  const tx = makeTx({
    amount: 12500,
    merchant: '스타벅스 세종점',
    memo: '주말 브런치',
    payment_method_id: 'bc',
    splits: [{ category_id: 'food', amount: 12500 }],
    tag_ids: ['trip'],
  });

  it('가맹점·메모·카테고리·태그·결제수단 이름으로 찾는다(띄어쓰기 무시)', () => {
    for (const text of ['스타벅스', '스타벅스세종', '브런치', '식비', '제주', 'bc카드']) {
      expect(matchesFilter(tx, { text }, lookup)).toBe(true);
    }
    expect(matchesFilter(tx, { text: '이마트' }, lookup)).toBe(false);
  });

  it('여러 낱말은 모두 맞아야 한다', () => {
    expect(matchesFilter(tx, { text: '스타벅스 식비' }, lookup)).toBe(true);
    expect(matchesFilter(tx, { text: '스타벅스 의류' }, lookup)).toBe(false);
  });

  it('금액 숫자로도 찾는다', () => {
    expect(matchesFilter(tx, { text: '12,500원' }, lookup)).toBe(true);
    expect(matchesFilter(tx, { text: '9900' }, lookup)).toBe(false);
  });

  it('조건 필터', () => {
    expect(matchesFilter(tx, { kinds: ['income'] }, lookup)).toBe(false);
    expect(matchesFilter(tx, { categoryIds: ['food'] }, lookup)).toBe(true);
    expect(matchesFilter(makeTx(), { categoryIds: [null] }, lookup)).toBe(true);
    expect(matchesFilter(tx, { minAmount: 20000 }, lookup)).toBe(false);
    expect(matchesFilter(tx, { onlyReview: true }, lookup)).toBe(false);
  });
});
