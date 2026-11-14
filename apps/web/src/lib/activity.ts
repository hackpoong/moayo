import { toKstDate, toKstTime, todayKst, type ActivityEntry } from '@moayo/core';

export const ACTION_LABEL: Record<ActivityEntry['action'], string> = {
  import: '불러옴',
  create: '입력함',
  update: '고침',
  delete: '지움',
  restore: '되살림',
  merge: '합침',
};

/** '오늘 14:02' / '11월 3일 09:10' */
export function whenLabel(iso: string): string {
  const d = toKstDate(iso);
  const t = toKstTime(new Date(iso));
  return d === todayKst() ? `오늘 ${t}` : `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일 ${t}`;
}
