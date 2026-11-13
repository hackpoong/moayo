import type { MemberRole } from '@moayo/core';
import { createContext, useContext } from 'react';
import { removeKey } from './storage.ts';

/** 내가 속한 가족 하나. */
export interface Membership {
  memberId: string;
  householdId: string;
  householdName: string;
  displayName: string;
  role: MemberRole;
}

export interface HouseholdContextValue {
  /** 저장해 둔 목록도 없고 서버 응답도 아직이면 true. */
  loading: boolean;
  error: string | null;
  memberships: Membership[];
  current: Membership | null;
  select: (householdId: string) => void;
  refresh: () => Promise<Membership[]>;
}

export const HouseholdContext = createContext<HouseholdContextValue | null>(null);

export const membershipsCacheKey = (userId: string) => `moayo.memberships.${userId}`;
export const CURRENT_HOUSEHOLD_KEY = 'moayo.currentHousehold';

export function useHouseholds(): HouseholdContextValue {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error('HouseholdProvider 밖에서 useHouseholds 를 불렀습니다.');
  return ctx;
}

/** 가족이 정해진 화면에서만 쓴다. */
export function useCurrentHousehold(): Membership {
  const { current } = useHouseholds();
  if (!current) throw new Error('가족이 선택되지 않았습니다.');
  return current;
}

/** 로그아웃할 때 기기에 남긴 가족 정보를 지운다. */
export function clearHouseholdCache(userId: string): void {
  removeKey(membershipsCacheKey(userId));
  removeKey(CURRENT_HOUSEHOLD_KEY);
}
