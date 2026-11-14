import { describe, expect, it } from 'vitest';
import { cardHintMatches, cardNumberTokens, coerceScannedCard, formatCardNumber, luhnValid, maskCardNumber, normalizeCvc, normalizeExpiry, typicalStartDay } from './card.ts';

describe('카드', () => {
  it('Luhn 검사', () => {
    expect(luhnValid('4111 1111 1111 1111')).toBe(true);
    expect(luhnValid('4111 1111 1111 1112')).toBe(false);
    expect(luhnValid('1234')).toBe(false);
  });
  it('번호 표시·가리기', () => {
    expect(formatCardNumber('4111111111111111')).toBe('4111 1111 1111 1111');
    expect(formatCardNumber('371449635398431')).toBe('3714 496353 98431');
    expect(maskCardNumber('4111111111111111')).toBe('4111 •••• •••• 1111');
  });
  it('유효기간·CVC', () => {
    expect(normalizeExpiry('8/29')).toBe('08/29');
    expect(normalizeExpiry('08-2029')).toBe('08/29');
    expect(normalizeExpiry('13/29')).toBeNull();
    expect(normalizeCvc('12a3')).toBe('123');
    expect(normalizeCvc('12')).toBeNull();
  });
  it('결제일로 이용기간 시작일 짐작', () => {
    expect([typicalStartDay(14), typicalStartDay(25), typicalStartDay(1)]).toEqual([1, 12, 18]);
  });
  it('AI 결과 다듬기', () => {
    const c = coerceScannedCard({ issuer: '현대카드', product_name: '현대카드 M', type: 'credit_card', number: '4111-1111-1111-1111', expiry: '8/29', cvc: '1234', emoji: '💳✨', color: '#1A1A1A', sms_aliases: ['현대카드', '현대', '현대카드'], confidence: 'high' });
    expect(c).toMatchObject({ number: '4111111111111111', expiry: '08/29', cvc: '1234', emoji: '💳', color: '#1a1a1a', sms_aliases: ['현대카드', '현대'], confidence: 'high' });
    expect(coerceScannedCard({ type: 'gold', number: '12', confidence: 'sure' })).toMatchObject({ type: null, number: null, confidence: 'low' });
  });
});

describe('카드번호 어떤 모양이든 맞추기', () => {
  const n = '4111223344551234';
  it('덩어리 꺼내기', () => {
    expect(cardNumberTokens('현대카드(4111-22**-****-1234) 승인 12,000원 11/14 14:02')).toEqual(['411122******1234']);
    expect(cardNumberTokens('신한카드 *1234 승인')).toEqual(['*1234']);
  });
  it.each([
    ['끝 4자리', '현대카드 1234 승인', true],
    ['괄호 끝자리', '현대(1234)승인', true],
    ['별표 끝자리', '현대카드 *1234', true],
    ['앞 6자리', '411122 일시불', true],
    ['가운데 가림', '4111-22**-****-1234', true],
    ['붙여 쓴 가림', '411122******1234', true],
    ['x 가림', '4111 22xx xxxx 1234', true],
    ['다른 끝자리', '현대카드 9999 승인', false],
    ['다른 앞자리', '540000******1234', false],
    ['금액·시각은 무시', '12,000원 14:02 11/14', false],
  ])('%s', (_, text, ok) => expect(cardHintMatches(text, n, null)).toBe(ok));
  it('번호 없이 끝 4자리만 아는 카드', () => {
    expect(cardHintMatches('4111-22**-****-1234', null, '1234')).toBe(true);
    expect(cardHintMatches('*1235', null, '1234')).toBe(false);
  });
});

describe('자산 연결', () => {
  const pm = (id: string, over: Record<string, unknown>) =>
    ({ id, household_id: 'h', created_at: '', updated_at: '', deleted_at: null, name: id, type: 'credit_card', issuer: null, last4: null, owner_member_id: 'm', aliases: [], billing: null, color: null, sort: 0, archived: false, ...over }) as never;
  const methods = [pm('현대M', { card_number: '4111223344551234', last4: '1234' }), pm('신한', { card_number: '5400112233449999', last4: '9999' })];
  it('가림표 번호·앞 6자리·끝자리로 카드를 고른다', async () => {
    const { resolvePaymentMethod } = await import('./ingest/normalize.ts');
    expect((resolvePaymentMethod(null, null, methods, '4111-22**-****-1234') as { id: string } | null)?.id).toBe('현대M');
    expect((resolvePaymentMethod(null, null, methods, '540011 일시불') as { id: string } | null)?.id).toBe('신한');
    expect((resolvePaymentMethod(null, '9999', methods) as { id: string } | null)?.id).toBe('신한');
  });
  it('문자 규칙 파서도 가림 번호를 넘긴다', async () => {
    const { parseSms } = await import('./ingest/sms.ts');
    const r = parseSms('[Web발신]\n현대카드 4111-22**-****-1234 승인\n홍길동님 12,000원 일시불\n11/14 14:02 스타벅스', '2026-11-14');
    expect(r?.items[0]?.card_number_hint).toBe('411122******1234');
  });
});
