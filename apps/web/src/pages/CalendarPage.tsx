import { dailyTotals, daysInMonth, formatCompact, formatWon, inRange, monthRange, parseDate, shiftMonth, todayKst, totals } from '@moayo/core';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BasisToggle, EmptyState, MonthNav } from '../components/bits.tsx';
import { TxRow } from '../components/TxRow.tsx';
import { useData } from '../data/dataContext.ts';
import { useLedger } from '../data/useLedger.ts';
import { useOpenEditor } from '../editor/editorContext.ts';
import { dayLabel } from '../lib/format.ts';
import { usePrefs } from '../lib/prefs.ts';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

export function CalendarPage() {
  const { basis } = usePrefs();
  const data = useData();
  const openEditor = useOpenEditor();
  const today = todayKst();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState<string>(today);

  const entries = useLedger(basis);
  const { from, to } = monthRange(month);
  const monthEntries = useMemo(() => inRange(entries, from, to), [entries, from, to]);
  const daily = useMemo(() => dailyTotals(monthEntries), [monthEntries]);
  const monthTotal = totals(monthEntries);

  const { y, m } = parseDate(from);
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = daysInMonth(y, m);
  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ];

  // 고른 날의 내역: 기준 날짜에 걸린 조각을 거래별로 합친다(할부는 그날 나가는 몫만).
  const dayItems = useMemo(() => {
    const byTx = new Map<string, number>();
    for (const e of entries) if (e.date === selected) byTx.set(e.txId, (byTx.get(e.txId) ?? 0) + e.amount);
    const txById = new Map(data.transactions.map((t) => [t.id, t]));
    return [...byTx.entries()].map(([id, amount]) => ({ tx: txById.get(id)!, amount })).filter((x) => x.tx);
  }, [entries, selected, data.transactions]);

  const changeMonth = (delta: number) => {
    const next = shiftMonth(month, delta);
    setMonth(next);
    setSelected(next === today.slice(0, 7) ? today : `${next}-01`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthNav month={month} onChange={changeMonth} />
        <BasisToggle basis={basis} />
      </div>

      <div className="tabular flex gap-4 px-1 text-sm">
        <span className="text-muted">
          지출 <b className="text-fg">{formatWon(monthTotal.expense)}</b>
        </span>
        <span className="text-muted">
          수입 <b className="text-income">{formatWon(monthTotal.income)}</b>
        </span>
      </div>

      <div className="rounded-2xl bg-surface p-2">
        <div className="grid grid-cols-7 text-center text-xs text-muted">
          {WEEK.map((w, i) => (
            <span key={w} className={`py-1.5 ${i === 0 ? 'text-expense' : ''}`}>
              {w}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((date, i) => {
            if (!date) return <span key={`blank-${i}`} />;
            const t = daily.get(date);
            const isSel = date === selected;
            const day = Number(date.slice(8));
            return (
              <button
                key={date}
                type="button"
                onClick={() => setSelected(date)}
                aria-pressed={isSel}
                aria-label={`${day}일${t?.expense ? ` 지출 ${formatWon(t.expense)}` : ''}${t?.income ? ` 수입 ${formatWon(t.income)}` : ''}`}
                className={`tabular flex h-16 flex-col items-center rounded-xl pt-1.5 text-[11px] leading-tight ${isSel ? 'bg-brand-soft' : ''}`}
              >
                <span
                  className={`mb-0.5 flex size-6 items-center justify-center rounded-full text-[13px] ${date === today ? 'bg-brand font-bold text-brand-fg' : i % 7 === 0 ? 'text-expense' : ''}`}
                >
                  {day}
                </span>
                {t?.expense ? <span className="text-fg">-{formatCompact(t.expense)}</span> : null}
                {t?.income ? <span className="text-income">+{formatCompact(t.income)}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      <section className="rounded-2xl bg-surface px-4 pb-1 pt-3">
        <header className="flex items-center justify-between border-b border-line pb-2">
          <span className="text-sm font-semibold">
            {dayLabel(selected)}
            {basis === 'cash' ? <span className="ml-1.5 font-normal text-muted">나간 돈</span> : null}
          </span>
          <button type="button" onClick={() => openEditor({ date: selected })} className="flex items-center gap-1 text-sm font-semibold text-brand">
            <Plus className="size-4" aria-hidden />
            이날 추가
          </button>
        </header>
        {dayItems.length === 0 ? (
          <div className="py-2">
            <EmptyState title="내역이 없습니다" />
          </div>
        ) : (
          <div className="divide-y divide-line">
            {dayItems.map(({ tx, amount }) => (
              <TxRow key={tx.id} tx={tx} amount={amount} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
