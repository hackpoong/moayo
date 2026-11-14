import { describe, expect, it } from 'vitest';
import { suggestFromTitle, titleSuggestions } from './suggest.ts';
import { makeTx } from './testkit.ts';
import type { Category } from './types.ts';

const cat = (id: string, name: string, kind: Category['kind'] = 'expense'): Category => ({
  id, household_id: 'h', created_at: '', updated_at: '', deleted_at: null, name, kind, icon: null, color: null, parent_id: null, sort: 0, archived: false,
});
const cats = [cat('food', '식비'), cat('cafe', '카페·간식'), cat('life', '생활용품'), cat('move', '교통·차량'), cat('pay', '급여', 'income')];

describe('suggestFromTitle', () => {
  it('예전에 같은 이름에 가장 많이 쓴 카테고리와 결제수단', () => {
    const history = [
      makeTx({ merchant: '다이소 도담점', splits: [{ category_id: 'life', amount: 1 }], payment_method_id: 'card' }),
      makeTx({ merchant: '다이소 도담점', splits: [{ category_id: 'life', amount: 1 }] }),
      makeTx({ merchant: '다이소 도담점', splits: [{ category_id: 'food', amount: 1 }] }),
    ];
    expect(suggestFromTitle('다이소도담점', 'expense', cats, history)).toEqual({ categoryId: 'life', paymentMethodId: 'card', reason: 'history' });
  });

  it('이름 일부가 겹치는 예전 기록', () => {
    const history = [makeTx({ merchant: '세종 숯불 갈비', splits: [{ category_id: 'food', amount: 1 }] })];
    expect(suggestFromTitle('숯불갈비', 'expense', cats, history).categoryId).toBe('food');
  });

  it('기록이 없으면 낱말 사전', () => {
    expect(suggestFromTitle('스타벅스 세종점', 'expense', cats, []).categoryId).toBe('cafe');
    expect(suggestFromTitle('코레일 승차권', 'expense', cats, []).categoryId).toBe('move');
    expect(suggestFromTitle('11월 급여', 'income', cats, []).categoryId).toBe('pay');
    expect(suggestFromTitle('알 수 없는 곳', 'expense', cats, []).categoryId).toBeNull();
  });

  it('지출 기록은 수입 추천에 쓰지 않는다', () => {
    const history = [makeTx({ kind: 'expense', merchant: '회사', splits: [{ category_id: 'food', amount: 1 }] })];
    expect(suggestFromTitle('회사', 'income', cats, history).categoryId).toBeNull();
  });
});

describe('titleSuggestions', () => {
  const h = (merchant: string, cat: string | null, date: string, pm: string | null = null) =>
    makeTx({ merchant, occurred_at: `${date}T03:00:00Z`, splits: cat ? [{ category_id: cat, amount: 1 }] : [], payment_method_id: pm });
  // 최근 것이 앞
  const history = [
    h('맥도날드 세종점', 'food', '2026-11-10', 'card'),
    h('스타벅스', 'cafe', '2026-11-09'),
    h('맥도날드 세종점', 'cafe', '2026-11-01'),
    h('메가커피', 'cafe', '2026-10-30'),
    h('맥주집', 'food', '2026-10-01'),
    h('롯데리아 맥도', 'food', '2026-09-01'),
  ];

  it('빈 입력이면 추천 없음', () => {
    expect(titleSuggestions('', 'expense', history)).toEqual([]);
    expect(titleSuggestions(' ', 'expense', history)).toEqual([]);
  });

  it('한 글자부터, 시작 일치 > 자주 > 최근, 마지막 분류·결제수단 함께', () => {
    const r = titleSuggestions('맥', 'expense', history);
    expect(r.map((s) => s.title)).toEqual(['맥도날드 세종점', '맥주집', '롯데리아 맥도']);
    expect(r[0]).toMatchObject({ categoryId: 'food', paymentMethodId: 'card', count: 2 });
  });

  it('최대 4개, 이미 다 친 제목은 빼기', () => {
    expect(titleSuggestions('커피', 'expense', history).map((s) => s.title)).toEqual(['메가커피']);
    expect(titleSuggestions('메가커피', 'expense', history)).toEqual([]);
  });
});
