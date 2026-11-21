import { describe, expect, it } from 'vitest';
import { isLocalCurrencyMethod, localCurrencyKey } from './normalize.ts';

describe('지역화폐 알아보기', () => {
  it('카드 성격·예전 그룹·이름', () => {
    expect(isLocalCurrencyMethod({ type: 'check_card', name: '체크(가)', card_kind: 'local_currency' })).toBe(true);
    expect(isLocalCurrencyMethod({ type: 'check_card', name: '디지털 카드', card_kind: 'onnuri' })).toBe(true);
    expect(isLocalCurrencyMethod({ type: 'local_currency', name: '무엇이든' })).toBe(true);
    expect(isLocalCurrencyMethod({ type: 'check_card', name: '온통대전(가)' })).toBe(true);
    expect(isLocalCurrencyMethod({ type: 'check_card', name: '여민전 체크', card_kind: 'general' })).toBe(false);
    expect(isLocalCurrencyMethod({ type: 'check_card', name: '하나 체크카드' })).toBe(false);
  });
  it('디지털온누리 이름', () => {
    expect(localCurrencyKey('디지털온누리')).toBe('온누리');
  });
});
