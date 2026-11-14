import {
  formatCompact,
  formatWon,
  groupSum,
  inRange,
  monthRange,
  monthlyTotals,
  shiftMonth,
  todayKst,
  totals,
  type DateString,
  type LedgerEntry,
} from '@moayo/core';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BasisToggle, CategoryIcon, EmptyState, MonthNav, Segmented } from '../components/bits.tsx';
import { useData } from '../data/dataContext.ts';
import { useLedger } from '../data/useLedger.ts';
import { monthLabel, shortDate } from '../lib/format.ts';
import { usePrefs } from '../lib/prefs.ts';

type PeriodMode = 'month' | '3m' | 'year' | 'custom';
type Side = 'expense' | 'income';

export function Stats() {
  const { basis } = usePrefs();
  const data = useData();
  const today = todayKst();
  const [mode, setMode] = useState<PeriodMode>('month');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [custom, setCustom] = useState({ from: `${today.slice(0, 7)}-01`, to: today });
  const [side, setSide] = useState<Side>('expense');

  const entries = useLedger(basis);
  const period = periodRange(mode, month, custom, today);
  const periodEntries = useMemo(() => inRange(entries, period.from, period.to), [entries, period.from, period.to]);
  const t = totals(periodEntries);
  const sideEntries = periodEntries.filter((e) => e.kind === side);
  const sideTotal = side === 'expense' ? t.expense : t.income;

  const byCategory = groupSum(sideEntries, (e) => e.categoryId);
  const byMember = groupSum(sideEntries, (e) => e.memberId);
  const byMethod = groupSum(sideEntries, (e) => e.paymentMethodId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {mode === 'month' ? (
          <MonthNav month={month} onChange={(d) => setMonth(shiftMonth(month, d))} />
        ) : (
          <h1 className="text-lg font-bold">{period.label}</h1>
        )}
        <BasisToggle basis={basis} />
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {(
          [
            ['month', '월별'],
            ['3m', '최근 3개월'],
            ['year', '올해'],
            ['custom', '기간 지정'],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            aria-pressed={mode === v}
            onClick={() => setMode(v)}
            className={`h-9 shrink-0 rounded-full px-3.5 text-sm font-medium ${mode === v ? 'bg-fg text-bg' : 'bg-surface text-muted'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'custom' ? (
        <div className="flex items-center gap-2">
          <input type="date" aria-label="시작일" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="h-11 flex-1 rounded-xl border border-line bg-surface px-3" />
          <span className="text-muted">~</span>
          <input type="date" aria-label="종료일" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="h-11 flex-1 rounded-xl border border-line bg-surface px-3" />
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <Tile label="지출" value={t.expense} />
        <Tile label="수입" value={t.income} tone="income" />
        <Tile label="남은 돈" value={t.income - t.expense} />
      </div>
      {t.transfer ? (
        <p className="px-1 text-xs text-muted">
          이체 {formatWon(t.transfer)}는 지출·수입 합계에서 뺐습니다(가족끼리 송금, 내 계좌 간 이체, 카드대금, 충전).
        </p>
      ) : null}

      <div className="flex">
        <Segmented
          value={side}
          onChange={setSide}
          ariaLabel="지출 또는 수입"
          options={[
            { value: 'expense', label: '지출 분석' },
            { value: 'income', label: '수입 분석' },
          ]}
        />
      </div>

      {sideEntries.length === 0 ? (
        <EmptyState title={`이 기간에는 ${side === 'expense' ? '지출' : '수입'}이 없습니다`} />
      ) : (
        <>
          <BarCard title="카테고리별" total={sideTotal} side={side}>
            {byCategory.map(({ key, amount }) => {
              const cat = key ? data.byId.category.get(key) : null;
              return {
                key: key ?? 'none',
                label: cat?.name ?? '미분류',
                icon: <CategoryIcon category={cat} size="sm" />,
                amount,
                href: `/transactions?category=${key ?? 'none'}${mode === 'month' ? `&month=${month}` : ''}`,
              };
            })}
          </BarCard>
          {data.members.length > 1 ? (
            <BarCard title="쓴 사람별" total={sideTotal} side={side}>
              {byMember.map(({ key, amount }) => ({
                key: key ?? 'none',
                label: key ? (data.byId.member.get(key)?.display_name ?? '알 수 없음') : '공동',
                amount,
              }))}
            </BarCard>
          ) : null}
          <BarCard title="결제수단별" total={sideTotal} side={side}>
            {byMethod.map(({ key, amount }) => ({
              key: key ?? 'none',
              label: key ? (data.byId.paymentMethod.get(key)?.name ?? '알 수 없음') : '지정 안 함',
              amount,
            }))}
          </BarCard>
        </>
      )}

      <TrendCard entries={entries} endMonth={mode === 'month' ? month : period.to.slice(0, 7)} />
    </div>
  );
}

function periodRange(mode: PeriodMode, month: string, custom: { from: string; to: string }, today: DateString) {
  if (mode === 'month') return { ...monthRange(month), label: monthLabel(month) };
  if (mode === '3m') {
    const from = monthRange(shiftMonth(today.slice(0, 7), -2)).from;
    return { from, to: today, label: `최근 3개월 (${shortDate(from)}~)` };
  }
  if (mode === 'year') return { from: `${today.slice(0, 4)}-01-01`, to: today, label: `${today.slice(0, 4)}년` };
  const from = custom.from <= custom.to ? custom.from : custom.to;
  const to = custom.from <= custom.to ? custom.to : custom.from;
  return { from, to, label: `${shortDate(from)} ~ ${shortDate(to)}` };
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: 'income' }) {
  return (
    <div className="rounded-2xl bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`tabular mt-1 truncate text-lg font-bold ${tone === 'income' ? 'text-income' : value < 0 ? 'text-expense' : ''}`} title={formatWon(value)}>
        {formatCompact(value)}
      </p>
    </div>
  );
}

interface BarItem {
  key: string;
  label: string;
  amount: number;
  icon?: React.ReactNode;
  href?: string;
}

/** 가로 막대 순위. 한 계열이라 범례 없이 제목이 무엇인지 말한다. */
function BarCard({ title, total, side, children }: { title: string; total: number; side: Side; children: BarItem[] }) {
  const max = Math.max(...children.map((c) => c.amount), 1);
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? children : children.slice(0, 6);
  return (
    <section className="rounded-2xl bg-surface p-4">
      <h2 className="mb-3 font-semibold">{title}</h2>
      <ul className="space-y-3">
        {shown.map((item) => {
          const pct = total ? Math.round((item.amount / total) * 1000) / 10 : 0;
          const row = (
            <>
              <div className="flex items-center gap-2.5">
                {item.icon}
                <span className="min-w-0 flex-1 truncate text-[15px]">{item.label}</span>
                <span className="tabular text-sm text-muted">{pct}%</span>
                <span className="tabular w-24 text-right text-[15px] font-semibold">{formatWon(item.amount)}</span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-chart-grid" aria-hidden>
                <div
                  className="h-2 rounded-full"
                  style={{
                    width: `${Math.max(1.5, (item.amount / max) * 100)}%`,
                    backgroundColor: side === 'expense' ? 'var(--app-chart-expense)' : 'var(--app-chart-income)',
                  }}
                />
              </div>
            </>
          );
          return (
            <li key={item.key}>
              {item.href ? (
                <Link to={item.href} className="block active:opacity-60">
                  {row}
                </Link>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
      {children.length > 6 ? (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-3 w-full py-1 text-sm font-medium text-muted">
          {expanded ? '접기' : `${children.length - 6}개 더 보기`}
        </button>
      ) : null}
    </section>
  );
}

/** 최근 6개월 지출·수입 막대. 두 계열이라 범례를 둔다. 누르면(또는 마우스를 올리면) 값이 나온다. */
function TrendCard({ entries, endMonth }: { entries: LedgerEntry[]; endMonth: string }) {
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(endMonth, i - 5));
  const monthly = useMemo(() => monthlyTotals(entries), [entries]);
  const rows = months.map((m) => ({ month: m, ...(monthly.get(m) ?? { income: 0, expense: 0, transfer: 0 }) }));
  const [active, setActive] = useState<string | null>(null);
  const [asTable, setAsTable] = useState(false);

  const max = niceMax(Math.max(...rows.flatMap((r) => [r.income, r.expense]), 1));
  const W = 320;
  const H = 150;
  const left = 36;
  const bottom = 22;
  const plotH = H - bottom - 8;
  const band = (W - left) / rows.length;
  const barW = Math.min(14, band / 2 - 4);
  const y = (v: number) => 8 + plotH - (v / max) * plotH;
  const activeRow = rows.find((r) => r.month === active);

  return (
    <section className="rounded-2xl bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">최근 6개월</h2>
        <button type="button" onClick={() => setAsTable((v) => !v)} className="text-sm text-muted underline">
          {asTable ? '그래프로 보기' : '표로 보기'}
        </button>
      </div>
      <div className="mb-2 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ backgroundColor: 'var(--app-chart-expense)' }} aria-hidden />
          지출
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ backgroundColor: 'var(--app-chart-income)' }} aria-hidden />
          수입
        </span>
      </div>

      {asTable ? (
        <table className="tabular w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1 font-medium">달</th>
              <th className="py-1 text-right font-medium">지출</th>
              <th className="py-1 text-right font-medium">수입</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month} className="border-t border-line">
                <td className="py-1.5">{monthLabel(r.month)}</td>
                <td className="py-1.5 text-right">{formatWon(r.expense)}</td>
                <td className="py-1.5 text-right">{formatWon(r.income)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="최근 6개월 지출과 수입 막대 그래프" onMouseLeave={() => setActive(null)}>
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={left} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="var(--app-chart-grid)" strokeWidth={1} />
                <text x={left - 6} y={y(max * f) + 3.5} textAnchor="end" fontSize={10} fill="var(--app-muted)">
                  {formatCompact(max * f)}
                </text>
              </g>
            ))}
            {rows.map((r, i) => {
              const cx = left + band * i + band / 2;
              return (
                <g key={r.month}>
                  <Bar x={cx - barW - 1} w={barW} top={y(r.expense)} base={y(0)} color="var(--app-chart-expense)" />
                  <Bar x={cx + 1} w={barW} top={y(r.income)} base={y(0)} color="var(--app-chart-income)" />
                  <text x={cx} y={H - 6} textAnchor="middle" fontSize={10.5} fill={r.month === active ? 'var(--app-fg)' : 'var(--app-muted)'}>
                    {Number(r.month.slice(5))}월
                  </text>
                  {/* 막대보다 넓은 누르기 영역 */}
                  <rect
                    x={left + band * i}
                    y={0}
                    width={band}
                    height={H}
                    fill="transparent"
                    onMouseEnter={() => setActive(r.month)}
                    onClick={() => setActive(r.month === active ? null : r.month)}
                  >
                    <title>{`${monthLabel(r.month)} 지출 ${formatWon(r.expense)}, 수입 ${formatWon(r.income)}`}</title>
                  </rect>
                </g>
              );
            })}
          </svg>
          {activeRow ? (
            <div className="tabular pointer-events-none absolute right-0 top-0 rounded-lg bg-fg px-2.5 py-1.5 text-xs text-bg shadow">
              <p className="font-semibold">{monthLabel(activeRow.month)}</p>
              <p>지출 {formatWon(activeRow.expense)}</p>
              <p>수입 {formatWon(activeRow.income)}</p>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

/** 위쪽만 4px 둥근 막대(바닥은 각지게). */
function Bar({ x, w, top, base, color }: { x: number; w: number; top: number; base: number; color: string }) {
  const h = base - top;
  if (h <= 0.5) return null;
  const r = Math.min(4, h, w / 2);
  const d = `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z`;
  return <path d={d} fill={color} />;
}

/** 축 최댓값을 보기 좋은 수로 올린다(1·2·5 × 10ⁿ). */
function niceMax(v: number): number {
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 5, 10]) if (v <= m * exp) return m * exp;
  return 10 * exp;
}
