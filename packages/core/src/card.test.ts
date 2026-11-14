import { describe, expect, it } from 'vitest';
import { coerceScannedCard, formatCardNumber, luhnValid, maskCardNumber, normalizeCvc, normalizeExpiry, typicalStartDay } from './card.ts';

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
