import type { Transaction } from './types.ts';

/**
 * 내역 목록 순서: 최근 것이 위.
 * 시간 없는 내역은 정오로 저장되고 같은 순간에 불러온 내역은 만든 시각까지 같아서,
 * 마지막으로 id 를 비교해 고친 뒤에도 순서가 바뀌지 않게 한다.
 */
export function compareRecent(a: Pick<Transaction, 'occurred_at' | 'created_at' | 'id'>, b: Pick<Transaction, 'occurred_at' | 'created_at' | 'id'>): number {
  return b.occurred_at.localeCompare(a.occurred_at) || b.created_at.localeCompare(a.created_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
