import type { Member } from '@moayo/core';
import { useData } from '../data/dataContext.ts';
import { memberColor } from '../lib/members.ts';

/** 누가 썼는지: 색 점 + 이름. */
export function MemberBadge({ member, size = 'sm' }: { member: Member | null | undefined; size?: 'sm' | 'md' }) {
  const { members } = useData();
  if (!member) return null;
  const color = memberColor(member, members);
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 font-medium ${size === 'md' ? 'text-[15px]' : 'text-[12px]'}`} style={{ color }}>
      <span className={`rounded-full ${size === 'md' ? 'size-2.5' : 'size-2'}`} style={{ backgroundColor: color }} aria-hidden />
      {member.display_name}
    </span>
  );
}
