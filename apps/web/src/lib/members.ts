import type { Member } from '@moayo/core';

/** 구성원 색(구분용). 서로 잘 구별되고 지출 빨강·수입 파랑과 겹치지 않는 색. */
export const MEMBER_COLORS = ['#7c3aed', '#db2777', '#0d9488', '#d97706', '#0284c7', '#65a30d'];

/** 저장된 색이 없으면 가족 안에서 들어온 순서대로 색을 정한다. */
export function memberColor(member: Pick<Member, 'id' | 'color'> | null | undefined, members: readonly Pick<Member, 'id'>[]): string {
  if (!member) return 'var(--app-muted)';
  if (member.color) return member.color;
  const i = members.findIndex((m) => m.id === member.id);
  return MEMBER_COLORS[(i < 0 ? 0 : i) % MEMBER_COLORS.length]!;
}
