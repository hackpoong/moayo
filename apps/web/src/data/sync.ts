// 서버 ↔ 기기 동기화.
//  쓰기: 기기 DB 에 바로 저장하고 outbox 에 넣는다 → 서버로 upsert → 서버가 돌려준 행으로 갈아 끼운다.
//  읽기: 커서(마지막으로 받은 updated_at) 이후 바뀐 행만 받아 온다. 그 사이에는 Realtime 으로 바로 받는다.
//  충돌: 행 단위로 나중에 쓴 쪽이 이긴다. 기기에 아직 올리지 못한 변경이 있으면 그 행은 서버 값으로 덮지 않는다.

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { PULL_TABLES, PUSH_TABLES, type LocalDb, type PullTable, type PushTable, type RowByTable } from './localDb.ts';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncStatus {
  state: SyncState;
  /** 처음 한 번이라도 서버에서 다 받아 왔는지. */
  initialized: boolean;
  lastSyncedAt: number | null;
  error: string | null;
}

const PAGE = 1000;
/** 커서를 이만큼 겹쳐서 받는다. 거의 같은 시각에 커밋된 행을 놓치지 않으려고. */
const OVERLAP_MS = 15_000;
const PUSH_BATCH = 200;

type AnyRow = RowByTable[PullTable];

export class SyncEngine {
  private channel: RealtimeChannel | null = null;
  private status: SyncStatus = { state: 'idle', initialized: false, lastSyncedAt: null, error: null };
  private listeners = new Set<(s: SyncStatus) => void>();
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private again = false;
  private stopped = false;
  private cleanups: (() => void)[] = [];

  constructor(
    private readonly client: SupabaseClient,
    private readonly db: LocalDb,
    private readonly householdId: string,
  ) {}

  // ── 상태 구독 ────────────────────────────────────────────────────────────
  getStatus(): SyncStatus {
    return this.status;
  }

  subscribe(listener: (s: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setStatus(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch };
    for (const l of this.listeners) l(this.status);
  }

  // ── 시작 / 정지 ──────────────────────────────────────────────────────────
  async start(): Promise<void> {
    const initialized = (await this.db.meta.get(this.metaKey('initialized')))?.value === '1';
    this.setStatus({ initialized });

    const onOnline = () => this.syncNow();
    const onVisible = () => document.visibilityState === 'visible' && this.syncNow();
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    const interval = window.setInterval(() => this.syncNow(), 5 * 60_000);
    this.cleanups.push(
      () => window.removeEventListener('online', onOnline),
      () => document.removeEventListener('visibilitychange', onVisible),
      () => window.clearInterval(interval),
    );

    this.subscribeRealtime();
    this.syncNow();
  }

  stop(): void {
    this.stopped = true;
    for (const c of this.cleanups) c();
    this.cleanups = [];
    if (this.pushTimer) clearTimeout(this.pushTimer);
    if (this.channel) void this.client.removeChannel(this.channel);
    this.channel = null;
    this.listeners.clear();
  }

  /** 올리고 받기. 이미 돌고 있으면 끝난 뒤 한 번 더 돈다. */
  syncNow(): void {
    if (this.stopped) return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = this.cycle().finally(() => {
      this.running = null;
      if (this.again && !this.stopped) {
        this.again = false;
        this.syncNow();
      }
    });
  }

  /** 기기에서 바뀐 것이 생겼을 때. 잠깐 모았다가 올린다. */
  schedulePush(): void {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => this.syncNow(), 250);
  }

  private async cycle(): Promise<void> {
    if (!navigator.onLine) {
      this.setStatus({ state: 'offline' });
      return;
    }
    this.setStatus({ state: 'syncing' });
    try {
      await this.push();
      await this.pull();
      if (!this.status.initialized) {
        await this.db.meta.put({ key: this.metaKey('initialized'), value: '1' });
      }
      const failing = await this.db.outbox.where('household_id').equals(this.householdId).filter((e) => !!e.last_error).count();
      this.setStatus({
        state: failing > 0 ? 'error' : 'idle',
        initialized: true,
        lastSyncedAt: Date.now(),
        error: failing > 0 ? `${failing}건을 서버에 저장하지 못했습니다.` : null,
      });
    } catch (e) {
      const offline = !navigator.onLine || isNetworkError(e);
      this.setStatus({ state: offline ? 'offline' : 'error', error: offline ? null : errorMessage(e) });
    }
  }

  // ── 올리기 ───────────────────────────────────────────────────────────────
  private async push(): Promise<void> {
    for (const table of PUSH_TABLES) {
      for (;;) {
        const entries = await this.db.outbox
          .where('household_id')
          .equals(this.householdId)
          .filter((e) => e.table === table && e.attempts < 5)
          .limit(PUSH_BATCH)
          .toArray();
        if (entries.length === 0) break;

        const rows = (await this.db.rows(table).bulkGet(entries.map((e) => e.id))).filter((r): r is NonNullable<typeof r> => !!r);
        const { data, error } = await this.client.from(table).upsert(rows.map(toServerRow), { onConflict: 'id' }).select();

        if (error) {
          if (isNetworkError(error)) throw error;
          // 한 묶음에 잘못된 행이 섞였을 수 있으니 하나씩 다시 보내서 범인만 남긴다.
          await this.pushOneByOne(table, entries);
          continue;
        }
        await this.acceptPushed(table, entries, (data ?? []) as AnyRow[]);
        if (entries.length < PUSH_BATCH) break;
      }
    }
  }

  private async pushOneByOne(table: PushTable, entries: { id: string; queued_at: number }[]): Promise<void> {
    for (const entry of entries) {
      const row = await this.db.rows(table).get(entry.id);
      if (!row) {
        await this.db.outbox.delete([table, entry.id]);
        continue;
      }
      const { data, error } = await this.client.from(table).upsert(toServerRow(row), { onConflict: 'id' }).select();
      if (error) {
        if (isNetworkError(error)) throw error;
        await this.db.outbox.update([table, entry.id], (e) => {
          e.attempts += 1;
          e.last_error = errorMessage(error);
        });
      } else {
        await this.acceptPushed(table, [entry], (data ?? []) as AnyRow[]);
      }
    }
  }

  /** 서버가 받아들인 행으로 바꾸고 outbox 에서 지운다. 올리는 사이에 또 고쳤으면 outbox 는 남긴다. */
  private async acceptPushed(table: PushTable, entries: { id: string; queued_at: number }[], serverRows: AnyRow[]) {
    await this.db.transaction('rw', [this.db.rows(table), this.db.outbox], async () => {
      for (const entry of entries) {
        const current = await this.db.outbox.get([table, entry.id]);
        const server = serverRows.find((r) => r.id === entry.id);
        if (current && current.queued_at === entry.queued_at) {
          await this.db.outbox.delete([table, entry.id]);
          if (server) await this.db.rows(table).put(server as never);
        }
      }
    });
  }

  // ── 받기 ─────────────────────────────────────────────────────────────────
  private async pull(): Promise<void> {
    for (const table of PULL_TABLES) {
      const cursorKey = this.metaKey(`cursor:${table}`);
      let cursor = (await this.db.meta.get(cursorKey))?.value ?? null;
      for (;;) {
        let query = this.client
          .from(table)
          .select('*')
          .eq('household_id', this.householdId)
          .order('updated_at', { ascending: true })
          .order('id', { ascending: true })
          .limit(PAGE);
        if (cursor) query = query.gt('updated_at', new Date(new Date(cursor).getTime() - OVERLAP_MS).toISOString());
        const { data, error } = await query;
        if (error) throw error;
        const rows = (data ?? []) as AnyRow[];
        await this.applyServerRows(table, rows);

        const newest = rows.at(-1)?.updated_at;
        if (newest && (!cursor || newest > cursor)) {
          cursor = newest;
          await this.db.meta.put({ key: cursorKey, value: newest });
        }
        // 겹쳐 받는 구간 때문에 같은 페이지가 반복되지 않도록, 꽉 찬 페이지일 때만 이어서 받는다.
        if (rows.length < PAGE || !newest) break;
      }
    }
  }

  /** 서버 행을 기기에 반영. 올리지 못한 변경이 있는 행과, 기기 쪽이 더 새 행은 건너뛴다. */
  private async applyServerRows(table: PullTable, rows: AnyRow[]): Promise<void> {
    if (rows.length === 0) return;
    const store = this.db.rows(table);
    await this.db.transaction('rw', [store, this.db.outbox], async () => {
      const pending = new Set(
        (await this.db.outbox.where('household_id').equals(this.householdId).filter((e) => e.table === table).toArray()).map((e) => e.id),
      );
      const existing = await store.bulkGet(rows.map((r) => r.id));
      const fresh = rows.filter((row, i) => {
        if (pending.has(row.id)) return false;
        const local = existing[i];
        return !local || local.updated_at <= row.updated_at;
      });
      if (fresh.length) await store.bulkPut(fresh as never[]);
    });
  }

  // ── Realtime ─────────────────────────────────────────────────────────────
  private subscribeRealtime(): void {
    let channel = this.client.channel(`household:${this.householdId}`);
    for (const table of PULL_TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `household_id=eq.${this.householdId}` },
        (payload) => {
          const row = payload.new as AnyRow | undefined;
          if (row && 'id' in row) void this.applyServerRows(table, [row]);
        },
      );
    }
    this.channel = channel.subscribe((status) => {
      // 연결이 (다시) 맺어지면 끊긴 사이의 변경을 받아 온다.
      if (status === 'SUBSCRIBED') this.syncNow();
    });
  }

  private metaKey(name: string): string {
    return `${this.householdId}:${name}`;
  }
}

/** 서버가 정하는 값은 보내지 않는다. */
function toServerRow(row: AnyRow): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  delete out.updated_at;
  delete out.created_by;
  return out;
}

function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

function isNetworkError(e: unknown): boolean {
  return /Failed to fetch|NetworkError|Load failed|network/i.test(errorMessage(e));
}
