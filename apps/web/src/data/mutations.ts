// 기기 DB 에 쓰고 outbox 에 넣은 뒤 동기화를 부른다. 화면은 기다리지 않는다.

import type { Category, PaymentMethod, Tag, Transaction, TransferRule } from '@moayo/core';
import { useCallback } from 'react';
import { useDataContext } from './dataContext.ts';
import type { PushTable, RowByTable } from './localDb.ts';

type Editable = Transaction | PaymentMethod | Category | Tag | TransferRule;

export function newId(): string {
  return crypto.randomUUID();
}

export function useMutations() {
  const { db, engine, householdId } = useDataContext();

  const save = useCallback(
    async <T extends PushTable>(table: T, row: RowByTable[T] & Editable) => {
      const now = new Date().toISOString();
      const stamped = { ...row, household_id: householdId, updated_at: now } as RowByTable[T];
      await db.transaction('rw', [db.rows(table), db.outbox], async () => {
        await db.rows(table).put(stamped as never);
        await db.outbox.put({ table, id: row.id, household_id: householdId, queued_at: Date.now(), attempts: 0, last_error: null });
      });
      engine.schedulePush();
      return stamped;
    },
    [db, engine, householdId],
  );

  /** 지우기는 deleted_at 만 찍는다(다른 기기에 전파되고, 되돌릴 수 있다). */
  const remove = useCallback(
    async <T extends PushTable>(table: T, row: RowByTable[T] & Editable) =>
      save(table, { ...row, deleted_at: new Date().toISOString() }),
    [save],
  );

  const restore = useCallback(
    async <T extends PushTable>(table: T, row: RowByTable[T] & Editable) => save(table, { ...row, deleted_at: null }),
    [save],
  );

  /** 서버가 거부한 변경을 다시 시도하게 한다. */
  const retryFailed = useCallback(async () => {
    await db.outbox
      .where('household_id')
      .equals(householdId)
      .modify((e) => {
        e.attempts = 0;
        e.last_error = null;
      });
    engine.syncNow();
  }, [db, engine, householdId]);

  return { save, remove, restore, retryFailed, householdId };
}

/** 새 행에 공통으로 들어가는 필드. */
export function baseRow(householdId: string) {
  const now = new Date().toISOString();
  return { id: newId(), household_id: householdId, created_at: now, updated_at: now, deleted_at: null };
}
