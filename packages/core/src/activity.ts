// 기록 묶기: 같은 사람이 같은 일을 잇달아 한 것(사진 한 장에서 여러 건 불러오기 등)은 한 줄로.

import type { ActivityEntry } from './types.ts';

export interface ActivityGroup {
  key: string;
  member_id: string | null;
  action: ActivityEntry['action'];
  at: string;
  entries: ActivityEntry[];
}

/** entries 는 최근 것이 앞. 같은 사람·같은 일이 gapMs 안에 이어지면 묶는다(고치기는 묶지 않음). */
export function groupActivity(entries: readonly ActivityEntry[], gapMs = 20_000): ActivityGroup[] {
  const groups: ActivityGroup[] = [];
  for (const e of entries) {
    const last = groups.at(-1);
    const prev = last?.entries.at(-1);
    if (
      last &&
      prev &&
      e.action !== 'update' &&
      last.action === e.action &&
      last.member_id === e.member_id &&
      Date.parse(prev.created_at) - Date.parse(e.created_at) <= gapMs
    ) {
      last.entries.push(e);
      continue;
    }
    groups.push({ key: e.id, member_id: e.member_id, action: e.action, at: e.created_at, entries: [e] });
  }
  return groups;
}
