// 이체 규칙: 받는 사람·적요·계좌가 규칙에 맞으면 '이체'로 본다(가족 송금, 본인 계좌 이체, 카드대금, 충전 등).

import type { Member, TransferRule } from './types.ts';

const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_.()[\]]/g, '');

export function matchTransferRule(
  texts: readonly (string | null | undefined)[],
  rules: readonly TransferRule[],
): TransferRule | null {
  const haystacks = texts.filter((t): t is string => !!t && t.trim().length > 0);
  if (haystacks.length === 0) return null;

  for (const rule of rules) {
    if (!rule.enabled || rule.deleted_at) continue;
    const pattern = normalize(rule.pattern);
    if (!pattern) continue;
    const hit = haystacks.some((text) => {
      if (rule.match_type === 'account') {
        // 계좌번호는 숫자만 비교한다. 가려진 번호(***-12-3456)도 끝자리가 맞으면 같은 계좌로 본다.
        const digits = text.replace(/\D/g, '');
        const want = rule.pattern.replace(/\D/g, '');
        return want.length >= 4 && digits.length >= 4 && (digits.includes(want) || want.endsWith(digits));
      }
      if (rule.match_type === 'name') {
        // 이름은 앞뒤 공백·괄호를 빼고 정확히 같거나, "홍길동(입금)" 처럼 이름으로 시작하면 맞는다.
        const t = normalize(text);
        return t === pattern || t.startsWith(pattern);
      }
      return normalize(text).includes(pattern);
    });
    if (hit) return rule;
  }
  return null;
}

/**
 * 구성원의 '이체로 볼 이름'(실명 등)을 이체 규칙으로 바꾼다.
 * 두 사람끼리 주고받은 돈은 지출·수입이 아니라 이체다.
 */
export function memberTransferRules(members: readonly Pick<Member, 'id' | 'household_id' | 'display_name' | 'emoji' | 'aliases' | 'deleted_at'>[]): TransferRule[] {
  const out: TransferRule[] = [];
  for (const m of members) {
    if (m.deleted_at) continue;
    for (const name of m.aliases ?? []) {
      if (normalize(name).length < 2) continue;
      out.push({
        id: `member-${m.id}-${name}`,
        household_id: m.household_id,
        created_at: '',
        updated_at: '',
        deleted_at: null,
        label: `${m.emoji ?? ''}${m.display_name}`,
        match_type: 'name',
        pattern: name,
        enabled: true,
      });
    }
  }
  return out;
}
