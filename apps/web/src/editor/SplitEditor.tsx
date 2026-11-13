import { formatAmount, formatWon, parseAmount, type Category, type Split } from '@moayo/core';
import { Plus, Trash2 } from 'lucide-react';

interface Props {
  amount: number;
  splits: Split[];
  categories: Category[];
  onChange: (splits: Split[]) => void;
}

/** 한 내역을 카테고리 여러 개로 금액을 나눈다. 마지막 줄은 남은 금액을 자동으로 받는다. */
export function SplitEditor({ amount, splits, categories, onChange }: Props) {
  const total = splits.reduce((s, x) => s + x.amount, 0);
  const remaining = amount - total;

  const update = (i: number, patch: Partial<Split>) => onChange(splits.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const remove = (i: number) => onChange(splits.filter((_, j) => j !== i));
  const add = () => onChange([...splits, { category_id: null, amount: Math.max(0, remaining) }]);

  return (
    <div className="space-y-2">
      {splits.map((split, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            aria-label={`${i + 1}번째 카테고리`}
            value={split.category_id ?? ''}
            onChange={(e) => update(i, { category_id: e.target.value || null })}
            className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-[15px]"
          >
            <option value="">미분류</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
          <input
            aria-label={`${i + 1}번째 금액`}
            inputMode="numeric"
            value={split.amount ? formatAmount(split.amount) : ''}
            onChange={(e) => update(i, { amount: parseAmount(e.target.value) ?? 0 })}
            className="tabular h-11 w-32 rounded-xl border border-line bg-surface px-3 text-right text-[15px]"
          />
          <button type="button" aria-label="이 줄 지우기" onClick={() => remove(i)} disabled={splits.length <= 1} className="rounded-full p-2 text-muted disabled:opacity-30">
            <Trash2 className="size-5" aria-hidden />
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between pt-1">
        <button type="button" onClick={add} className="flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-brand">
          <Plus className="size-4" aria-hidden />
          나누기 추가
        </button>
        <span className={`tabular text-sm ${remaining === 0 ? 'text-muted' : 'font-semibold text-expense'}`}>
          {remaining === 0 ? '합계가 맞습니다' : remaining > 0 ? `${formatWon(remaining)} 남음` : `${formatWon(-remaining)} 넘음`}
        </span>
      </div>
    </div>
  );
}
