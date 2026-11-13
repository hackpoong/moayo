import type { MemberRole } from '@moayo/core';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSession } from './authContext.ts';
import {
  CURRENT_HOUSEHOLD_KEY,
  HouseholdContext,
  membershipsCacheKey,
  type HouseholdContextValue,
  type Membership,
} from './householdContext.ts';
import { readJson, writeJson } from './storage.ts';
import { db } from './supabase.ts';

interface MembershipRow {
  id: string;
  household_id: string;
  display_name: string;
  role: MemberRole;
  households: { name: string; deleted_at: string | null } | null;
}

async function fetchMemberships(userId: string): Promise<Membership[]> {
  const { data, error } = await db()
    .from('members')
    .select('id, household_id, display_name, role, households(name, deleted_at)')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at');
  if (error) throw error;
  return (data as unknown as MembershipRow[])
    .filter((row) => row.households && !row.households.deleted_at)
    .map((row) => ({
      memberId: row.id,
      householdId: row.household_id,
      householdName: row.households!.name,
      displayName: row.display_name,
      role: row.role,
    }));
}

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const userId = session.user.id;

  // 지난번에 받아 둔 목록으로 바로 시작하고, 서버 값은 뒤에서 받아 갈아 끼운다.
  const [memberships, setMemberships] = useState<Membership[] | null>(() => readJson<Membership[]>(membershipsCacheKey(userId)));
  const [currentId, setCurrentId] = useState<string | null>(() => readJson<string>(CURRENT_HOUSEHOLD_KEY));
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback(
    (result: { list: Membership[] } | { error: unknown }) => {
      if ('list' in result) {
        setMemberships(result.list);
        setError(null);
        writeJson(membershipsCacheKey(userId), result.list);
      } else {
        // 오프라인이면 저장해 둔 목록으로 계속 쓴다.
        setError(result.error instanceof Error ? result.error.message : '가족 정보를 불러오지 못했습니다.');
        setMemberships((prev) => prev ?? []);
      }
    },
    [userId],
  );

  const refresh = useCallback(async () => {
    try {
      const list = await fetchMemberships(userId);
      apply({ list });
      return list;
    } catch (error) {
      apply({ error });
      return [];
    }
  }, [userId, apply]);

  useEffect(() => {
    let active = true;
    fetchMemberships(userId).then(
      (list) => active && apply({ list }),
      (error: unknown) => active && apply({ error }),
    );
    return () => {
      active = false;
    };
  }, [userId, apply]);

  const select = useCallback((householdId: string) => {
    setCurrentId(householdId);
    writeJson(CURRENT_HOUSEHOLD_KEY, householdId);
  }, []);

  const value = useMemo<HouseholdContextValue>(() => {
    const list = memberships ?? [];
    const current = list.find((m) => m.householdId === currentId) ?? list[0] ?? null;
    return { loading: memberships === null, error, memberships: list, current, select, refresh };
  }, [memberships, currentId, error, select, refresh]);

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}
