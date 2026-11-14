import { describe, expect, it } from 'vitest';
import { joinIconName, splitIconName } from './iconName.ts';

describe('이모지 + 이름', () => {
  it.each([
    ['🍚식비', '🍚', '식비'],
    ['🍚 식비', '🍚', '식비'],
    ['★중요', '★', '중요'],
    ['👨‍👩‍👧가족', '👨‍👩‍👧', '가족'],
    ['식비', null, '식비'],
    ['3월 여행', null, '3월 여행'],
    ['(주)회사', null, '(주)회사'],
    ['🍚', null, '🍚'],
  ])('%s', (input, icon, name) => expect(splitIconName(input)).toEqual({ icon, name }));
  it('되돌리기', () => expect(joinIconName('🍚', '식비')).toBe('🍚식비'));
});
