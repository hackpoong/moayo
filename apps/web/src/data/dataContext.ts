import type { Category, Member, PaymentMethod, Tag, Transaction, TransferRule } from '@moayo/core';
import { createContext, useContext } from 'react';
import type { LocalDb } from './localDb.ts';
import type { SyncEngine, SyncStatus } from './sync.ts';

export interface HouseholdData {
  transactions: Transaction[];
  paymentMethods: PaymentMethod[];
  categories: Category[];
  tags: Tag[];
  transferRules: TransferRule[];
  members: Member[];
  /** id → 행. 화면에서 이름을 찾을 때 쓴다. */
  byId: {
    category: Map<string, Category>;
    paymentMethod: Map<string, PaymentMethod>;
    tag: Map<string, Tag>;
    member: Map<string, Member>;
  };
  pendingCount: number;
}

export interface DataContextValue {
  db: LocalDb;
  engine: SyncEngine;
  householdId: string;
  /** 기기 DB 를 처음 읽기 전이면 null. */
  data: HouseholdData | null;
  status: SyncStatus;
}

export const DataContext = createContext<DataContextValue | null>(null);

export function useDataContext(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('DataProvider 밖에서 데이터를 쓰려고 했습니다.');
  return ctx;
}

const EMPTY: HouseholdData = {
  transactions: [],
  paymentMethods: [],
  categories: [],
  tags: [],
  transferRules: [],
  members: [],
  byId: { category: new Map(), paymentMethod: new Map(), tag: new Map(), member: new Map() },
  pendingCount: 0,
};

/** 화면용 데이터. 기기 DB 를 읽기 전에는 빈 값(곧 채워짐). */
export function useData(): HouseholdData {
  return useDataContext().data ?? EMPTY;
}

export function useDataReady(): boolean {
  return useDataContext().data !== null;
}

export function useSyncStatus(): SyncStatus & { pendingCount: number } {
  const { status, data } = useDataContext();
  return { ...status, pendingCount: data?.pendingCount ?? 0 };
}
