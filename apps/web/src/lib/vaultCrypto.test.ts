import { describe, expect, it } from 'vitest';
import { createVault, openVault, seal, unseal, vaultPasswordProblem } from './vaultCrypto.ts';

describe('카드 금고', () => {
  it('맞는 비밀번호로만 열리고, 암호문은 원문을 드러내지 않는다', async () => {
    const { meta, key } = await createVault('우리집금고2026', 1000 * 100);
    const sealed = await seal(key, { number: '4111111111111111', expiry: '08/29', cvc: '123' });
    expect(JSON.stringify(sealed)).not.toContain('4111');
    const again = await openVault('우리집금고2026', meta);
    expect(again).not.toBeNull();
    expect(await unseal(again!, sealed)).toEqual({ number: '4111111111111111', expiry: '08/29', cvc: '123' });
    expect(await openVault('틀린비밀번호', meta)).toBeNull();
  });
  it('같은 값도 매번 다른 암호문', async () => {
    const { key } = await createVault('abcdefg', 100_000);
    const a = await seal(key, 'x');
    const b = await seal(key, 'x');
    expect(a.ct).not.toBe(b.ct);
  });
  it('비밀번호 규칙', () => {
    expect(vaultPasswordProblem('123')).not.toBeNull();
    expect(vaultPasswordProblem('111111')).not.toBeNull();
    expect(vaultPasswordProblem('하늘색고양이')).toBeNull();
  });
});
