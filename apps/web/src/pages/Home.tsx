import { formatWon, inRange, monthRange, todayKst, totals } from '@moayo/core';
import { ChevronRight, CircleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { BasisToggle, EmptyState } from '../components/bits.tsx';
import { InstallPrompt } from '../components/InstallPrompt.tsx';
import { TxRow } from '../components/TxRow.tsx';
import { ImportButtons } from '../editor/ImportSheet.tsx';
import { useData, useDataReady } from '../data/dataContext.ts';
import { useLedger } from '../data/useLedger.ts';
import { useOpenEditor } from '../editor/editorContext.ts';
import { useCurrentHousehold } from '../lib/householdContext.ts';
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

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-sm text-muted">{household.householdName}</p>
          <h1 className="text-2xl font-bold">{Number(month.slice(5))}월 가계부</h1>
        </div>
        <BasisToggle basis={basis} />
      </header>

      <section className="rounded-2xl bg-surface p-5">
        <p className="text-sm text-muted">{basis === 'cash' ? '이번 달 나간 돈' : '이번 달 쓴 돈'}</p>
        <p className="tabular mt-1 text-3xl font-bold">{formatWon(t.expense)}</p>
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
