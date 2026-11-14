import type { Category, CategoryKind } from '@moayo/core';
import { useState } from 'react';
import { CategoryIcon } from '../components/bits.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { Button } from '../components/ui.tsx';
import { useData } from '../data/dataContext.ts';
import { baseRow, useMutations } from '../data/mutations.ts';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../lib/categoryStyle.ts';
import { useCurrentHousehold } from '../lib/householdContext.ts';

/** 입력 화면에서 바로 분류를 하나 더한다. 저장하면 입력판으로 돌아가 그 분류가 골라진다. */
export function QuickAddCategory({ kind, onCreated, onClose }: { kind: CategoryKind; onCreated: (c: Category) => void; onClose: () => void }) {
  const household = useCurrentHousehold();
  const data = useData();
  const { save } = useMutations();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📦');

  const create = () => {
    const n = name.trim();
    if (!n) return;
    const same = data.categories.find((c) => c.kind === kind && c.name === n && !c.archived);
    if (same) return onCreated(same);
    const used = data.categories.filter((c) => c.kind === kind).length;
    const row: Category = {
      ...baseRow(household.householdId),
      name: n.slice(0, 30),
      kind,
      icon,
      color: CATEGORY_COLORS[used % CATEGORY_COLORS.length]!,
      parent_id: null,
      sort: used,
      archived: false,
    };
    void save('categories', row);
    onCreated(row);
  };

  return (
    <Sheet title={`${kind === 'income' ? '수입' : '지출'} 분류 추가`} onClose={onClose} footer={<Button block disabled={!name.trim()} onClick={create}>추가하고 고르기</Button>}>
      <div className="space-y-4 pt-1">
        <div className="flex items-center gap-3">
          <CategoryIcon category={{ icon, color: null } as Category} size="lg" />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), create())}
            placeholder="분류 이름 (예: 부모님, 반려동물)"
            aria-label="분류 이름"
            maxLength={30}
            autoFocus
            className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 text-[16px] outline-none focus:border-brand"
          />
        </div>
        <div className="grid grid-cols-8 gap-1">
          {CATEGORY_ICONS.map((i) => (
            <button key={i} type="button" aria-pressed={i === icon} onClick={() => setIcon(i)} className={`flex aspect-square items-center justify-center rounded-lg text-xl ${i === icon ? 'bg-brand-soft ring-2 ring-brand' : ''}`}>
              {i}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
