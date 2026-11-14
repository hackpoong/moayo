// 방금 저장한 내역을 목록에서 잠깐 반짝이게 한다(어디 들어갔는지 눈에 보이게).

import { useSyncExternalStore } from 'react';

let flashing = new Map<string, number>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function flashRow(id: string): void {
  flashing = new Map(flashing).set(id, Date.now());
  notify();
  window.setTimeout(() => {
    flashing = new Map(flashing);
    flashing.delete(id);
    notify();
  }, 1600);
}

export function useIsFlashing(id: string): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => flashing.has(id),
  );
}

/** 짧은 진동(안드로이드). 지원 안 되면 조용히 넘어간다. */
export function haptic(ms = 8): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // 무시
  }
}
