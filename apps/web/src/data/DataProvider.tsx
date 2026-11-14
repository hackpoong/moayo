import type { Category, Member, PaymentMethod, Tag, Transaction, TransferRule } from '@moayo/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { db as supabaseClient } from '../lib/supabase.ts';
import { DataContext, type DataContextValue, type HouseholdData } from './dataContext.ts';
import { openLocalDb, type PushTable, type RowByTable } from './localDb.ts';
import { SyncEngine, type SyncStatus } from './sync.ts';

const byOrder = <T extends { sort: number; name: string }>(a: T, b: T) => a.sort - b.sort || a.name.localeCompare(b.name, 'ko');
const byRecent = (a: Transaction, b: Transaction) => b.occurred_at.localeCompare(a.occurred_at) || b.created_at.localeCompare(a.created_at);
const live = <T extends { deleted_at: string | null }>(rows: T[]) => rows.filter((r) => !r.deleted_at);

type Overlay = { [K in PushTable]: Map<string, RowByTable[K]> };
const emptyOverlay = (): Overlay => ({
  transactions: new Map(),
  payment_methods: new Map(),
  categories: new Map(),
  tags: new Map(),
  transfer_rules: new Map(),
  merchant_rules: new Map(),
});

/** 기기 DB 결과 위에, 방금 저장해서 아직 기기 DB 에 안 들어간 행을 덮어씌운다. */
function merge<T extends { id: string; updated_at: string }>(rows: T[] | undefined, overlay: Map<string, T>): T[] | undefined {
  if (!rows) return rows;
  if (overlay.size === 0) return rows;
  const out = rows.map((r) => {
    const o = overlay.get(r.id);
    return o && o.updated_at >= r.updated_at ? o : r;
  });
  const known = new Set(rows.map((r) => r.id));
  for (const [id, o] of overlay) if (!known.has(id)) out.push(o);
  return out;
}

export function DataProvider({ userId, householdId, children }: { userId: string; householdId: string; children: ReactNode }) {
  const db = useMemo(() => openLocalDb(userId), [userId]);
  const engine = useMemo(() => new SyncEngine(supabaseClient(), db, householdId), [db, householdId]);
  const [status, setStatus] = useState<SyncStatus>(() => engine.getStatus());
  const [overlay, setOverlay] = useState<Overlay>(emptyOverlay);

  useEffect(() => {
    const unsubscribe = engine.subscribe(setStatus);
    void engine.start();
    return () => {
      unsubscribe();
      engine.stop();
    };
  }, [engine]);

  // 표마다 따로 지켜본다. 내역을 저장해도 분류·결제수단·구성원 표는 다시 읽지 않는다.
  const transactionsRaw = useLiveQuery(() => db.transactions.where('household_id').equals(householdId).toArray(), [db, householdId]);
  const paymentMethodsRaw = useLiveQuery(() => db.payment_methods.where('household_id').equals(householdId).toArray(), [db, householdId]);
  const categoriesRaw = useLiveQuery(() => db.categories.where('household_id').equals(householdId).toArray(), [db, householdId]);
  const tagsRaw = useLiveQuery(() => db.tags.where('household_id').equals(householdId).toArray(), [db, householdId]);
  const rulesRaw = useLiveQuery(() => db.transfer_rules.where('household_id').equals(householdId).toArray(), [db, householdId]);
  const renamesRaw = useLiveQuery(() => db.merchant_rules.where('household_id').equals(householdId).toArray(), [db, householdId]);
  const membersRaw = useLiveQuery(() => db.members.where('household_id').equals(householdId).toArray(), [db, householdId]);
  const pendingCount = useLiveQuery(() => db.outbox.where('household_id').equals(householdId).count(), [db, householdId]);

  /** 저장 즉시 화면에 반영. 기기 DB 에 들어간 것이 확인되면 덮어쓴 행은 걷어 낸다. */
  const applyOptimistic = useCallback(<T extends PushTable>(table: T, row: RowByTable[T]) => {
    setOverlay((prev) => {
      const next = { ...prev, [table]: new Map(prev[table] as Map<string, RowByTable[T]>) } as Overlay;
      (next[table] as Map<string, RowByTable[T]>).set(row.id, row);
      return next;
    });
  }, []);
  const settleOptimistic = useCallback(<T extends PushTable>(table: T, id: string, updatedAt: string) => {
    setOverlay((prev) => {
      const cur = (prev[table] as Map<string, RowByTable[T]>).get(id);
      if (!cur || cur.updated_at !== updatedAt) return prev;
      const next = { ...prev, [table]: new Map(prev[table] as Map<string, RowByTable[T]>) } as Overlay;
      (next[table] as Map<string, RowByTable[T]>).delete(id);
      return next;
    });
  }, []);

  // 기기 DB 결과에 같은(또는 더 새) 행이 들어오면 덮어쓴 행을 걷어 낸다.
  useEffect(() => {
    const raws: { [K in PushTable]: { id: string; updated_at: string }[] | undefined } = {
      transactions: transactionsRaw,
      payment_methods: paymentMethodsRaw,
      categories: categoriesRaw,
      tags: tagsRaw,
      transfer_rules: rulesRaw,
      merchant_rules: renamesRaw,
    };
    // 외부(기기 DB) 결과에 맞춰 덮어쓴 행을 정리하는 것이라 effect 안에서 상태를 바꾼다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOverlay((prev) => {
      let changed = false;
      const next = { ...prev } as Overlay;
      for (const table of Object.keys(prev) as PushTable[]) {
        const pending = prev[table] as Map<string, { updated_at: string }>;
        const raw = raws[table];
        if (!raw || pending.size === 0) continue;
        const rawById = new Map(raw.map((r) => [r.id, r.updated_at]));
        let copy: Map<string, { updated_at: string }> | null = null;
        for (const [id, row] of pending) {
          const stored = rawById.get(id);
          if (stored && stored >= row.updated_at) {
            copy ??= new Map(pending);
            copy.delete(id);
          }
        }
        if (copy) {
          changed = true;
          (next as Record<PushTable, unknown>)[table] = copy;
        }
      }
      return changed ? next : prev;
    });
  }, [transactionsRaw, paymentMethodsRaw, categoriesRaw, tagsRaw, rulesRaw, renamesRaw]);

  const txState = useMemo(() => {
    const rows = merge(transactionsRaw, overlay.transactions);
    if (!rows) return undefined;
    const list: Transaction[] = [];
    const mergedInto = new Map<string, Transaction[]>();
    for (const t of rows) {
      if (t.deleted_at) continue;
      if (t.status === 'merged') {
        if (t.linked_tx_id) mergedInto.set(t.linked_tx_id, [...(mergedInto.get(t.linked_tx_id) ?? []), t]);
        continue;
      }
      list.push(t);
    }
    return { transactions: list.sort(byRecent), mergedInto };
  }, [transactionsRaw, overlay.transactions]);
  const paymentMethodsAll = useMemo(() => merge(paymentMethodsRaw, overlay.payment_methods), [paymentMethodsRaw, overlay.payment_methods]);
  const categoriesAll = useMemo(() => merge(categoriesRaw, overlay.categories), [categoriesRaw, overlay.categories]);
  const tagsAll = useMemo(() => merge(tagsRaw, overlay.tags), [tagsRaw, overlay.tags]);
  const rules = useMemo(() => merge(rulesRaw, overlay.transfer_rules), [rulesRaw, overlay.transfer_rules]);
  const renames = useMemo(() => merge(renamesRaw, overlay.merchant_rules), [renamesRaw, overlay.merchant_rules]);

  const lookups = useMemo(() => {
    if (!paymentMethodsAll || !categoriesAll || !tagsAll || !membersRaw) return null;
    return {
      paymentMethods: live(paymentMethodsAll).sort(byOrder),
      categories: live(categoriesAll).sort(byOrder),
      tags: live(tagsAll).sort((a, b) => a.name.localeCompare(b.name, 'ko')),
      // 나간 구성원도 예전 내역에 이름을 보여 줘야 하므로 남겨 둔다.
      members: [...membersRaw].sort((a, b) => a.created_at.localeCompare(b.created_at)),
      byId: {
        category: new Map<string, Category>(categoriesAll.map((c) => [c.id, c])),
        paymentMethod: new Map<string, PaymentMethod>(paymentMethodsAll.map((p) => [p.id, p])),
        tag: new Map<string, Tag>(tagsAll.map((t) => [t.id, t])),
        member: new Map<string, Member>(membersRaw.map((m) => [m.id, m])),
      },
    };
  }, [paymentMethodsAll, categoriesAll, tagsAll, membersRaw]);

  const data = useMemo<HouseholdData | null>(() => {
    if (!txState || !lookups || !rules) return null;
    return {
      transactions: txState.transactions,
      mergedInto: txState.mergedInto,
      merchantRules: live(renames ?? []),
      transferRules: live(rules as TransferRule[]),
      pendingCount: pendingCount ?? 0,
      ...lookups,
    };
  }, [txState, lookups, rules, renames, pendingCount]);

  const value = useMemo<DataContextValue>(
    () => ({ db, engine, householdId, data, status, applyOptimistic, settleOptimistic }),
    [db, engine, householdId, data, status, applyOptimistic, settleOptimistic],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
