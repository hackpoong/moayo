import { describe, expect, it } from 'vitest';
import { parseKoreanNumber, parseSpokenEntry } from './voice.ts';

const pm = (id: string, name: string, aliases: string[] = []) => ({ id, name, aliases, archived: false, deleted_at: null });
const methods = [pm('hd', '현대카드'), pm('cash', '현금'), pm('local', '여민전', ['세종 여민전'])];

describe('한국어 금액 읽기', () => {
  it.each([
    ['오천', 5000],
    ['만 이천 오백', 12500],
    ['3만5천', 35000],
    ['12,500', 12500],
    ['천오백', 1500],
    ['십만', 100000],
    ['백이십만 삼천', 1203000],
  ])('%s → %d', (t, n) => expect(parseKoreanNumber(t)).toBe(n));
  it('숫자가 아니면 null', () => expect(parseKoreanNumber('마트')).toBeNull());
});

describe('음성 문장 해석', () => {
  it('제목 금액 자산', () => {
    expect(parseSpokenEntry('맥도날드 오천원 현대카드', methods)).toEqual({ title: '맥도날드', amount: 5000, paymentMethodId: 'hd' });
  });
  it('조사·순서가 달라도', () => {
    expect(parseSpokenEntry('현대 카드로 이마트 3만 5천원', methods)).toEqual({ title: '이마트', amount: 35000, paymentMethodId: 'hd' });
    expect(parseSpokenEntry('여민전으로 싱싱장터 만 천오백 원', methods)).toEqual({ title: '싱싱장터', amount: 11500, paymentMethodId: 'local' });
  });
  it('가게 이름 속 숫자 글자는 금액으로 보지 않는다', () => {
    expect(parseSpokenEntry('이마트 오천원', methods)).toEqual({ title: '이마트', amount: 5000, paymentMethodId: null });
  });
  it('금액이 없으면 null', () => {
    expect(parseSpokenEntry('주차비', methods)).toEqual({ title: '주차비', amount: null, paymentMethodId: null });
  });
});
