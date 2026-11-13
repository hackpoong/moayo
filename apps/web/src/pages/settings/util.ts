export const inputClass = 'h-12 w-full rounded-xl border border-line bg-surface px-4 text-[15px]';

/** 정렬 순서 바꾸기: 두 행의 sort 를 맞바꾼다. */
export function swapSort<T extends { sort: number }>(list: T[], i: number, j: number): [T, T] | null {
  const a = list[i];
  const b = list[j];
  if (!a || !b) return null;
  const sa = a.sort === b.sort ? i : a.sort;
  const sb = a.sort === b.sort ? j : b.sort;
  return [
    { ...a, sort: sb },
    { ...b, sort: sa },
  ];
}
