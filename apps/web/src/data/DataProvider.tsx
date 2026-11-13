import type { Category, Member, PaymentMethod, Tag, Transaction, TransferRule } from '@moayo/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { db as supabaseClient } from '../lib/supabase.ts';
import { DataContext, type DataContextValue, type HouseholdData } from './dataContext.ts';
import { openLocalDb } from './localDb.ts';
import { SyncEngine, type SyncStatus } from './sync.ts';

const byOrder = <T extends { sort: number; name: string }>(a: T, b: T) => a.sort - b.sort || a.name.localeCompare(b.name, 'ko');

export function DataProvider({ userId, householdId, children }: { userId: string; householdId: string; children: ReactNode }) {
  const db = useMemo(() => openLocalDb(userId), [userId]);
  const engine = useMemo(() => new SyncEngine(supabaseClient(), db, householdId), [db, householdId]);
  const [status, setStatus] = useState<SyncStatus>(() => engine.getStatus());

  useEffect(() => {
    const unsubscribe = engine.subscribe(setStatus);
    void engine.start();
    return () => {
      unsubscribe();
      engine.stop();
    };
  }, [engine]);

  // 가족 데이터 전체를 메모리에 올려 둔다(몇 년 치여도 몇 MB). 기기 DB 가 바뀌면 자동으로 다시 읽는다.
  const data = useLiveQuery(async (): Promise<HouseholdData> => {
    const where = <T,>(table: { where(i: string): { equals(v: string): { toArray(): Promise<T[]> } } }) =>
      table.where('household_id').equals(householdId).toArray();
    const [transactions, paymentMethods, categories, tags, transferRules, members, pendingCount] = await Promise.all([
      where<Transaction>(db.transactions),
      where<PaymentMethod>(db.payment_methods),
      where<Category>(db.categories),
      where<Tag>(db.tags),
      where<TransferRule>(db.transfer_rules),
      where<Member>(db.members),
      db.outbox.where('household_id').equals(householdId).count(),
    ]);
    const live = <T extends { deleted_at: string | null }>(rows: T[]) => rows.filter((r) => !r.deleted_at);
    const liveTx = live(transactions).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.created_at.localeCompare(a.created_at));
    return {
      transactions: liveTx,
      paymentMethods: live(paymentMethods).sort(byOrder),
      categories: live(categories).sort(byOrder),
      tags: live(tags).sort((a, b) => a.name.localeCompare(b.name, 'ko')),
      transferRules: live(transferRules),
      // 나간 구성원도 예전 내역에 이름을 보여 줘야 하므로 남겨 둔다.
      members: members.sort((a, b) => a.created_at.localeCompare(b.created_at)),
      byId: {
        category: new Map(categories.map((c) => [c.id, c])),
        paymentMethod: new Map(paymentMethods.map((p) => [p.id, p])),
        tag: new Map(tags.map((t) => [t.id, t])),
        member: new Map(members.map((m) => [m.id, m])),
      },
      pendingCount,
    };
  }, [db, householdId]);

  const value = useMemo<DataContextValue>(
    () => ({ db, engine, householdId, data: data ?? null, status }),
    [db, engine, householdId, data, status],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
