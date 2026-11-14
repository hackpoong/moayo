import type { Member } from '@moayo/core';
import { useData } from '../data/dataContext.ts';
import { memberColor } from '../lib/members.ts';

/** 누가 썼는지: 이모지(없으면 색 점) + 이름(구성원 색). */
export function MemberBadge({ member, size = 'sm' }: { member: Member | null | undefined; size?: 'sm' | 'md' }) {
  const { members } = useData();
  if (!member) return null;
  const color = memberColor(member, members);
  return (
    <span className={`inline-flex shrink-0 items-center gap-0.5 font-semibold ${size === 'md' ? 'text-[15px]' : 'text-[12px]'}`} style={{ color }}>
      {member.emoji ? (
        <span aria-hidden className="leading-none">
          {member.emoji}
        </span>
      ) : (
        <span className={`rounded-full ${size === 'md' ? 'size-2.5' : 'size-2'}`} style={{ backgroundColor: color }} aria-hidden />
      )}
      {member.display_name}
    </span>
  );
}
