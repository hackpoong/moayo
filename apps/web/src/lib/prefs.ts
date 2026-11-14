// 기기별 화면 설정(날짜 기준 등). localStorage 에 두고 여러 화면이 같은 값을 보게 한다.

import type { DateBasis } from '@moayo/core';
import { useSyncExternalStore } from 'react';
import { readJson, writeJson } from './storage.ts';

export type AiQuality = 'fast' | 'accurate';

interface Prefs {
  basis: DateBasis;
  /** 사진을 읽을 때 쓸 AI: 빠르고 싼 모델 / 정확한 모델. */
  aiQuality: AiQuality;
}

const KEY = 'moayo.prefs';
const DEFAULTS: Prefs = { basis: 'occurred', aiQuality: 'fast' };

let prefs: Prefs = { ...DEFAULTS, ...(readJson<Partial<Prefs>>(KEY) ?? {}) };
const listeners = new Set<() => void>();

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  prefs = { ...prefs, [key]: value };
  writeJson(KEY, prefs);
  for (const l of listeners) l();
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => prefs,
  );
}
