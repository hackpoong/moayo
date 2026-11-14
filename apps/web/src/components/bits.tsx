import type { Category, DateBasis } from '@moayo/core';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { monthLabel } from '../lib/format.ts';
import { setPref } from '../lib/prefs.ts';

/** 카테고리 아이콘(이모지)을 색 원 안에. */
export function CategoryIcon({ category, size = 'md' }: { category: Category | null | undefined; size?: 'sm' | 'md' | 'lg' }) {
  const box = { sm: 'size-8 text-base', md: 'size-10 text-xl', lg: 'size-12 text-2xl' }[size];
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full ${box}`}
      style={{ backgroundColor: category?.color ? `${category.color}22` : 'var(--app-surface-2)' }}
      aria-hidden
    >
      {category?.icon ?? '❔'}
    </span>
  );
}

export function MonthNav({ month, onChange, children }: { month: string; onChange: (delta: number) => void; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" aria-label="이전 달" onClick={() => onChange(-1)} className="rounded-full p-2 text-muted hover:bg-surface-2">
        <ChevronLeft className="size-5" aria-hidden />
      </button>
      <span className="tabular min-w-20 text-center text-lg font-bold">{monthLabel(month)}</span>
      <button type="button" aria-label="다음 달" onClick={() => onChange(1)} className="rounded-full p-2 text-muted hover:bg-surface-2">
        <ChevronRight className="size-5" aria-hidden />
      </button>
      {children}
    </div>
  );
}

/** 발생일 / 현금일 기준 토글. 기기에 기억한다. */
export function BasisToggle({ basis }: { basis: DateBasis }) {
  return (
    <Segmented
      value={basis}
      onChange={(v) => setPref('basis', v)}
      options={[
        { value: 'occurred', label: '쓴 날' },
        { value: 'cash', label: '나간 날' },
      ]}
      ariaLabel="날짜 기준"
      size="sm"
    />
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  ariaLabel: string;
  size?: 'sm' | 'md';
}

export function Segmented<T extends string>({ value, onChange, options, ariaLabel, size = 'md' }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`whitespace-nowrap rounded-lg font-semibold transition-colors ${size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 flex-1 px-4 text-[15px]'} ${o.value === value ? 'bg-surface text-fg shadow-sm' : 'text-muted'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, onClick, children, className = '' }: { active?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors ${active ? 'bg-brand text-brand-fg' : 'bg-surface-2 text-fg'} ${className}`}
    >
      {children}
    </button>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface px-5 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {children ? <div className="mt-1.5 text-sm text-muted">{children}</div> : null}
    </div>
  );
}
