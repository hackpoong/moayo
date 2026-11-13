// 기기 안의 복제본(IndexedDB). 화면은 이것만 읽으므로 네트워크를 기다리지 않는다.
// 사용자마다 DB 를 따로 둬서, 한 기기에서 계정을 바꿔도 데이터가 섞이지 않는다.

import type { Category, Member, PaymentMethod, Tag, Transaction, TransferRule } from '@moayo/core';
import Dexie, { type Table } from 'dexie';

/** 클라이언트가 서버로 올리는 테이블. */
export const PUSH_TABLES = ['payment_methods', 'categories', 'tags', 'transfer_rules', 'transactions'] as const;
export type PushTable = (typeof PUSH_TABLES)[number];

/** 서버에서 받아 오는 테이블(구성원은 읽기만). */
export const PULL_TABLES = [...PUSH_TABLES, 'members'] as const;
export type PullTable = (typeof PULL_TABLES)[number];

export interface RowByTable {
  payment_methods: PaymentMethod;
  categories: Category;
  tags: Tag;
  transfer_rules: TransferRule;
  transactions: Transaction;
  members: Member;
}

/** 아직 서버에 올리지 못한 변경. 같은 행은 하나로 합쳐진다. */
export interface OutboxEntry {
  table: PushTable;
  id: string;
  household_id: string;
  queued_at: number;
  attempts: number;
  last_error: string | null;
}

export interface MetaEntry {
  key: string;
  value: string;
}

export class LocalDb extends Dexie {
  payment_methods!: Table<PaymentMethod, string>;
  categories!: Table<Category, string>;
  tags!: Table<Tag, string>;
  transfer_rules!: Table<TransferRule, string>;
  transactions!: Table<Transaction, string>;
  members!: Table<Member, string>;
  outbox!: Table<OutboxEntry, [string, string]>;
  meta!: Table<MetaEntry, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      payment_methods: 'id, household_id',
      categories: 'id, household_id',
      tags: 'id, household_id',
      transfer_rules: 'id, household_id',
      transactions: 'id, household_id, [household_id+occurred_at]',
      members: 'id, household_id',
      outbox: '[table+id], household_id, queued_at',
      meta: 'key',
    });
  }

  rows<T extends PullTable>(table: T): Table<RowByTable[T], string> {
    return this.table(table) as Table<RowByTable[T], string>;
  }
}

const dbName = (userId: string) => `moayo-${userId}`;
let current: { userId: string; db: LocalDb } | null = null;

export function openLocalDb(userId: string): LocalDb {
  if (current?.userId === userId) return current.db;
  current?.db.close();
  current = { userId, db: new LocalDb(dbName(userId)) };
  return current.db;
}

/** 로그아웃할 때 기기에 남은 가계부를 지운다. */
export async function deleteLocalDb(userId: string): Promise<void> {
  if (current?.userId === userId) {
    current.db.close();
    current = null;
  }
  await Dexie.delete(dbName(userId));
}
