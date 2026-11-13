import { describe, expect, it } from 'vitest';
import { matchTransferRule } from './rules.ts';
import { makeRule } from './testkit.ts';

describe('matchTransferRule', () => {
  const rules = [
    makeRule({ label: '엄마', match_type: 'name', pattern: '김영희' }),
    makeRule({ label: '내 저축계좌', match_type: 'account', pattern: '110-123-456789' }),
    makeRule({ label: '카드대금', match_type: 'keyword', pattern: '카드대금' }),
    makeRule({ label: '꺼진 규칙', match_type: 'keyword', pattern: '충전', enabled: false }),
  ];

  it('이름은 정확히 같거나 이름으로 시작해야 맞는다', () => {
    expect(matchTransferRule(['김영희'], rules)?.label).toBe('엄마');
    expect(matchTransferRule(['김영희(용돈)'], rules)?.label).toBe('엄마');
    expect(matchTransferRule(['김영희네 반찬가게'], rules)?.label).toBe('엄마'); // 이름으로 시작 → 맞음
    expect(matchTransferRule(['이김영희'], rules)).toBeNull();
  });

  it('계좌는 숫자만 비교하고, 가려진 번호도 끝자리로 맞춘다', () => {
    expect(matchTransferRule(['신한 110123456789'], rules)?.label).toBe('내 저축계좌');
    expect(matchTransferRule(['***-***-456789'], rules)?.label).toBe('내 저축계좌');
    expect(matchTransferRule(['999-000-111'], rules)).toBeNull();
  });

  it('키워드는 포함되면 맞는다', () => {
    expect(matchTransferRule(['현대카드 카드대금 출금'], rules)?.label).toBe('카드대금');
  });

  it('꺼진 규칙과 빈 입력은 무시한다', () => {
    expect(matchTransferRule(['페이머니 충전'], rules)).toBeNull();
    expect(matchTransferRule([null, '', undefined], rules)).toBeNull();
  });
});
