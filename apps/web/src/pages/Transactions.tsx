import {
  formatWon,
  matchesFilter,
  monthRange,
  shiftMonth,
  toKstDate,
  todayKst,
  type Transaction,
  type TransactionFilter,
  type TransactionKind,
} from '@moayo/core';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useDeferredValue, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Chip, EmptyState, MonthNav } from '../components/bits.tsx';
import { TxRow } from '../components/TxRow.tsx';
import { useData } from '../data/dataContext.ts';
import { KIND_LABEL } from '../lib/format.ts';

/** 내역: 달별 목록. 검색어나 조건을 넣으면 전체 기간에서 찾는다. */
export function Transactions() {
  const data = useData();
  const [params, setParams] = useSearchParams();
  const month = params.get('month') ?? todayKst().slice(0, 7);
  const [text, setText] = useState(params.get('q') ?? '');
  const deferredText = useDeferredValue(text);
  const [showFilters, setShowFilters] = useState(false);
  const [kinds, setKinds] = useState<TransactionKind[]>([]);
  const categoryId = params.get('category');
  const [paymentMethodIds, setPaymentMethodIds] = useState<string[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const onlyReview = params.get('review') === '1';

  const filter: TransactionFilter = {
    text: deferredText,
    kinds,
    categoryIds: categoryId ? [categoryId === 'none' ? null : categoryId] : undefined,
    paymentMethodIds,
    memberIds,
    onlyReview,
  };
  const searching = !!deferredText.trim() || kinds.length > 0 || !!categoryId || paymentMethodIds.length > 0 || memberIds.length > 0 || onlyReview;

  const lookup = useMemo(
    () => ({
      categoryName: (id: string) => data.byId.category.get(id)?.name,
      tagName: (id: string) => data.byId.tag.get(id)?.name,
      paymentMethodName: (id: string) => data.byId.paymentMethod.get(id)?.name,
    }),
    [data.byId],
  );

  const list = useMemo(() => {
    if (searching) return data.transactions.filter((tx) => matchesFilter(tx, filter, lookup));
    const { from, to } = monthRange(month);
    return data.transactions.filter((tx) => {
      const d = toKstDate(tx.occurred_at);
      return d >= from && d <= to;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.transactions, searching, month, deferredText, kinds, categoryId, paymentMethodIds, memberIds, onlyReview, lookup]);

  const groups = useMemo(() => groupByDay(list), [list]);
  const sum = (k: TransactionKind) => list.filter((t) => t.kind === k && t.status !== 'canceled').reduce((s, t) => s + t.amount, 0);

  const setMonth = (delta: number) => {
    const next = new URLSearchParams(params);
    next.set('month', shiftMonth(month, delta));
    setParams(next, { replace: true });
  };
  const clearParam = (key: string) => {
    const next = new URLSearchParams(params);
    next.delete(key);
    setParams(next, { replace: true });
  };
  const toggle = <T,>(list: T[], set: (v: T[]) => void, v: T) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {searching ? <h1 className="text-2xl font-bold">검색</h1> : <MonthNav month={month} onChange={setMonth} />}
      </div>

      <div className="flex gap-2">
        <label className="flex h-11 flex-1 items-center gap-2 rounded-xl bg-surface px-3">
          <Search className="size-5 text-muted" aria-hidden />
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="가맹점, 메모, 카테고리, 태그, 금액"
            aria-label="내역 검색"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
          />
        </label>
        <button
          type="button"
          aria-label="조건"
          aria-pressed={showFilters}
          onClick={() => setShowFilters((v) => !v)}
          className={`flex size-11 items-center justify-center rounded-xl ${showFilters ? 'bg-brand text-brand-fg' : 'bg-surface text-muted'}`}
        >
          <SlidersHorizontal className="size-5" aria-hidden />
        </button>
      </div>

      {categoryId || onlyReview ? (
        <div className="flex flex-wrap gap-2">
          {categoryId ? (
            <Chip active onClick={() => clearParam('category')}>
              {categoryId === 'none' ? '미분류' : (data.byId.category.get(categoryId)?.name ?? '카테고리')}
              <X className="size-4" aria-label="조건 지우기" />
            </Chip>
          ) : null}
          {onlyReview ? (
            <Chip active onClick={() => clearParam('review')}>
              확인 필요
              <X className="size-4" aria-label="조건 지우기" />
            </Chip>
          ) : null}
        </div>
      ) : null}

      {showFilters ? (
        <div className="space-y-3 rounded-2xl bg-surface p-4">
          <FilterRow label="구분">
            {(['expense', 'income', 'transfer'] as const).map((k) => (
              <Chip key={k} active={kinds.includes(k)} onClick={() => toggle(kinds, setKinds, k)}>
                {KIND_LABEL[k]}
              </Chip>
            ))}
          </FilterRow>
          <FilterRow label="자산">
            {data.paymentMethods.map((pm) => (
              <Chip key={pm.id} active={paymentMethodIds.includes(pm.id)} onClick={() => toggle(paymentMethodIds, setPaymentMethodIds, pm.id)}>
                {pm.name}
              </Chip>
            ))}
          </FilterRow>
          {data.members.length > 1 ? (
            <FilterRow label="쓴 사람">
              {data.members.map((m) => (
                <Chip key={m.id} active={memberIds.includes(m.id)} onClick={() => toggle(memberIds, setMemberIds, m.id)}>
                  {m.emoji ?? ''}
                  {m.display_name}
                </Chip>
              ))}
            </FilterRow>
          ) : null}
        </div>
      ) : null}

      {/* 편한가계부처럼 수입·지출·합계 띠 */}
      <div className="tabular grid grid-cols-3 rounded-2xl bg-surface py-2.5 text-center">
        <div>
          <p className="text-xs font-normal text-muted">수입</p>
          <p className="text-[15px] font-semibold text-income">{sum('income').toLocaleString('ko-KR')}</p>
        </div>
        <div>
          <p className="text-xs font-normal text-muted">지출</p>
          <p className="text-[15px] font-semibold text-expense">{sum('expense').toLocaleString('ko-KR')}</p>
        </div>
        <div>
          <p className="text-xs font-normal text-muted">{searching ? `합계 · ${list.length}건` : '합계'}</p>
          <p className="text-[15px] font-semibold">{(sum('income') - sum('expense')).toLocaleString('ko-KR')}</p>
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState title={searching ? '찾는 내역이 없습니다' : '이 달에는 아직 내역이 없습니다'}>
          {searching ? '다른 낱말로 찾아보세요.' : '아래 + 버튼으로 첫 내역을 넣어 보세요.'}
        </EmptyState>
      ) : (
        <DayList groups={groups} />
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

type DayGroup = { date: string; items: Transaction[]; expense: number; income: number };

/**
 * 날짜별 묶음 목록. 몇 년 치를 검색해도 화면에 보이는 묶음만 그린다(가상화).
 * 묶음 높이는 줄 수에 따라 다르므로 그려진 뒤 실제 높이를 잰다.
 */
function DayList({ groups }: { groups: DayGroup[] }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  useLayoutEffect(() => setOffset(listRef.current?.offsetTop ?? 0), []);
  const v = useWindowVirtualizer({
    count: groups.length,
    estimateSize: (i) => 52 + groups[i]!.items.length * 57,
    overscan: 4,
    scrollMargin: offset,
    getItemKey: (i) => groups[i]!.date,
  });
  return (
    <div ref={listRef} style={{ height: v.getTotalSize(), position: 'relative' }}>
      {v.getVirtualItems().map((item) => {
        const g = groups[item.index]!;
        const d = g.date;
        return (
          <section
            key={item.key}
            data-index={item.index}
            ref={v.measureElement}
            className="absolute inset-x-0 top-0 pb-3"
            style={{ transform: `translateY(${item.start - v.options.scrollMargin}px)` }}
          >
            <div className="rounded-2xl bg-surface px-4 pb-1 pt-3">
              <header className="tabular flex items-center gap-2 border-b border-line pb-2">
                <span className="text-xl font-bold leading-none">{Number(d.slice(8))}</span>
                <span className="rounded-md bg-brand-soft px-1.5 py-0.5 text-xs font-semibold text-brand">{WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()]}요일</span>
                <span className="text-xs font-normal text-muted">{d.slice(0, 7).replace('-', '.')}</span>
                <span className="ml-auto flex gap-2 text-sm font-semibold">
                  {g.income ? <span className="text-income">{formatWon(g.income)}</span> : null}
                  {g.expense ? <span className="text-expense">{formatWon(g.expense)}</span> : null}
                </span>
              </header>
              <div className="divide-y divide-line">
                {g.items.map((tx) => (
                  <TxRow key={tx.id} tx={tx} />
                ))}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

function groupByDay(list: Transaction[]) {
  const groups: DayGroup[] = [];
  for (const tx of list) {
    const date = toKstDate(tx.occurred_at);
    let g = groups.at(-1);
    if (!g || g.date !== date) {
      g = { date, items: [], expense: 0, income: 0 };
      groups.push(g);
    }
    g.items.push(tx);
    if (tx.kind === 'expense' && tx.status !== 'canceled') g.expense += tx.amount;
    if (tx.kind === 'income' && tx.status !== 'canceled') g.income += tx.amount;
  }
  return groups;
}
