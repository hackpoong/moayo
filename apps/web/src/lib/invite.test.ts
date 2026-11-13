import { describe, expect, it } from 'vitest';
import { extractInviteCode } from './invite.ts';

describe('extractInviteCode', () => {
  it('코드만 넣어도, 소문자·공백이 섞여도 된다', () => {
    expect(extractInviteCode('K7QW3MNP2X')).toBe('K7QW3MNP2X');
    expect(extractInviteCode(' k7qw-3mnp-2x ')).toBe('K7QW3MNP2X');
  });

  it('초대 링크를 통째로 붙여 넣어도 코드를 뽑는다', () => {
    expect(extractInviteCode('‘우리 가족’ 가계부에 초대합니다. https://moayo.app/join/K7QW3MNP2X')).toBe('K7QW3MNP2X');
  });

  it('길이가 맞지 않으면 null', () => {
    expect(extractInviteCode('ABC')).toBeNull();
    expect(extractInviteCode('')).toBeNull();
  });
});
