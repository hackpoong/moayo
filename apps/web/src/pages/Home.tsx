import { clampDay, formatDate, formatWon, inRange, monthRange, parseDate, shiftMonth, todayKst, totals, type LedgerEntry, type Member } from '@moayo/core';
import { ChevronRight, CircleAlert, History } from 'lucide-react';
import { useState } from 'react';
import { ActivityLogSheet } from '../components/ActivityLog.tsx';
import { Link } from 'react-router';
import { BasisToggle, EmptyState } from '../components/bits.tsx';
import { InstallPrompt } from '../components/InstallPrompt.tsx';
import { TxRow } from '../components/TxRow.tsx';
import { ImportButtons } from '../editor/ImportButtons.tsx';
import { useData, useDataReady } from '../data/dataContext.ts';
import { useLedger } from '../data/useLedger.ts';
import { useOpenEditor } from '../editor/editorContext.ts';
import { useCurrentHousehold } from '../lib/householdContext.ts';
import { memberColor } from '../lib/members.ts';
import { usePrefs } from '../lib/prefs.ts';

export function Home() {
  const household = useCurrentHousehold();
  const data = useData();
  const ready = useDataReady();
  const { basis } = usePrefs();
  const openEditor = useOpenEditor();
  const month = todayKst().slice(0, 7);
  const entries = useLedger(basis);
  const { from, to } = monthRange(month);
  const t = totals(inRange(entries, from, to));
  const reviewCount = data.transactions.filter((tx) => tx.status === 'review').length;
  const recent = data.transactions.slice(0, 8);
  const [logOpen, setLogOpen] = useState(false);

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-sm text-muted">{household.householdName}</p>
          <h1 className="text-2xl font-bold">{Number(month.slice(5))}월 가계부</h1>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="기록 보기" onClick={() => setLogOpen(true)} className="press flex size-10 items-center justify-center rounded-full text-muted">
            <History className="size-5" aria-hidden />
          </button>
          <BasisToggle basis={basis} />
        </div>
      </header>
      {logOpen ? <ActivityLogSheet onClose={() => setLogOpen(false)} /> : null}

      <section className="rounded-2xl bg-surface p-5">
        <p className="text-sm text-muted">{basis === 'cash' ? '이번 달 나간 돈' : '이번 달 쓴 돈'}</p>
        <p className="tabular mt-1 text-3xl font-bold">{formatWon(t.expense)}</p>
        <VsLastMonth entries={entries} month={month} />
        <MemberShare entries={inRange(entries, from, to)} members={data.members} />
        <div className="tabular mt-3 flex gap-4 text-sm">
          <span className="text-muted">
            수입 <b className="text-income">{formatWon(t.income)}</b>
          </span>
          <span className="text-muted">
            남은 돈 <b className={t.income - t.expense < 0 ? 'text-expense' : 'text-fg'}>{formatWon(t.income - t.expense)}</b>
          </span>
        </div>
      </section>

      <InstallPrompt />

      <ImportButtons onPick={(mode) => openEditor({ importMode: mode })} />

      {reviewCount > 0 ? (
        <Link to="/transactions?review=1" className="flex items-center gap-3 rounded-2xl bg-expense/10 px-5 py-4">
          <CircleAlert className="size-5 text-expense" aria-hidden />
          <span className="flex-1 font-medium">확인이 필요한 내역 {reviewCount}건</span>
          <ChevronRight className="size-5 text-muted" aria-hidden />
        </Link>
      ) : null}

      <section className="rounded-2xl bg-surface px-4 pb-1 pt-4">
        <header className="flex items-center justify-between pb-1">
          <h2 className="font-semibold">최근 내역</h2>
          <Link to="/transactions" className="text-sm text-muted">
            전체 보기
          </Link>
        </header>
        {recent.length === 0 ? (
          <div className="pb-3">
            {ready ? (
              <EmptyState title="아직 내역이 없습니다">
                <button type="button" onClick={() => openEditor()} className="font-semibold text-brand">
                  첫 내역 넣기
                </button>
              </EmptyState>
            ) : (
              <RowSkeleton />
            )}
          </div>
        ) : (
          <div className="divide-y divide-line">
            {recent.map((tx) => (
              <TxRow key={tx.id} tx={tx} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** 처음 불러올 때 회색 빈 줄(무엇이 올지 미리 보여 주면 덜 기다리는 느낌). */
function RowSkeleton() {
  return (
    <div className="space-y-3 py-2" aria-busy="true" aria-label="불러오는 중">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex animate-pulse items-center gap-3">
          <span className="size-10 rounded-full bg-surface-2" />
          <span className="flex-1 space-y-1.5">
            <span className="block h-3.5 w-1/2 rounded bg-surface-2" />
            <span className="block h-3 w-1/3 rounded bg-surface-2" />
          </span>
          <span className="h-4 w-16 rounded bg-surface-2" />
        </div>
      ))}
    </div>
  );
}

/** 지난달 같은 날까지 쓴 돈과 비교: ▲ 더 씀(빨강) / ▼ 덜 씀(초록). */
function VsLastMonth({ entries, month }: { entries: readonly LedgerEntry[]; month: string }) {
  const today = todayKst();
  const { from } = monthRange(month);
  const prev = shiftMonth(month, -1);
  const { y, m } = parseDate(`${prev}-01`);
  const prevFrom = monthRange(prev).from;
  const prevTo = formatDate(y, m, clampDay(y, m, parseDate(today).d));
  const now = totals(inRange(entries, from, today)).expense;
  const before = totals(inRange(entries, prevFrom, prevTo)).expense;
  const diff = now - before;
  if (!before) return null;
  return (
    <p className="tabular mt-1 text-[13px] text-muted">
      지난달 이맘때보다{' '}
      {diff === 0 ? (
        <b className="text-fg">같아요</b>
      ) : (
        <b className={diff > 0 ? 'text-expense' : 'text-emerald-600 dark:text-emerald-400'}>
          {diff > 0 ? '▲' : '▼'} {formatWon(Math.abs(diff))}
        </b>
      )}
    </p>
  );
}

/** 💙·💛 이번 달 지출 비율 막대. */
function MemberShare({ entries, members }: { entries: readonly LedgerEntry[]; members: Member[] }) {
  if (members.length < 2) return null;
  const sums = members.map((mb) => ({
    m: mb,
    amount: entries.filter((e) => e.kind === 'expense' && e.memberId === mb.id).reduce((a, e) => a + e.amount, 0),
  }));
  const total = sums.reduce((a, s) => a + s.amount, 0);
  if (!total) return null;
  return (
    <div className="mt-3">
      <div className="flex h-2 overflow-hidden rounded-full bg-fg/8" role="img" aria-label={sums.map((s) => `${s.m.display_name} ${Math.round((s.amount / total) * 100)}%`).join(', ')}>
        {sums.map((s) =>
          s.amount ? <span key={s.m.id} className="h-full transition-[width] duration-500" style={{ width: `${(s.amount / total) * 100}%`, backgroundColor: memberColor(s.m, members) }} /> : null,
        )}
      </div>
      <div className="tabular mt-1.5 flex justify-between text-[12px] text-muted">
        {sums.map((s) => (
          <span key={s.m.id}>
            {s.m.emoji} {s.m.display_name} <b className="text-fg">{formatWon(s.amount)}</b> · {Math.round((s.amount / total) * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}
