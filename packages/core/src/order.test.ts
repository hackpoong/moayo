import { describe, expect, it } from 'vitest';
import { compareRecent } from './order.ts';

describe('내역 순서', () => {
  it('날짜·만든 시각이 같아도(시간 없음·같이 불러옴) 늘 같은 순서', () => {
    const t = (id: string) => ({ id, occurred_at: '2026-11-14T03:00:00Z', created_at: '2026-11-14T05:00:00Z' });
    const a = [t('c'), t('a'), t('b')].sort(compareRecent).map((x) => x.id);
    const b = [t('b'), t('c'), t('a')].sort(compareRecent).map((x) => x.id);
    expect(a).toEqual(['a', 'b', 'c']);
    expect(b).toEqual(a);
  });
});
