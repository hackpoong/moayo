import type { Category, CategoryKind } from '@moayo/core';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { CategoryIcon, Segmented } from '../../components/bits.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { Button } from '../../components/ui.tsx';
import { useData } from '../../data/dataContext.ts';
import { baseRow, useMutations } from '../../data/mutations.ts';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../../lib/categoryStyle.ts';
import { useCurrentHousehold } from '../../lib/householdContext.ts';
import { Labeled, MoveButtons, SettingsHeader } from './common.tsx';
import { inputClass, swapSort } from './util.ts';

const COLORS = CATEGORY_COLORS;
const ICONS = CATEGORY_ICONS;

export function CategoriesPage() {
  const data = useData();
  const { save } = useMutations();
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const list = data.categories.filter((c) => c.kind === kind && !c.archived);
  const archived = data.categories.filter((c) => c.kind === kind && c.archived);

  const move = (i: number, j: number) => {
    const pair = swapSort(list, i, j);
    if (pair) for (const row of pair) void save('categories', row);
  };

  return (
    <div className="space-y-4">
      <SettingsHeader
        title="카테고리"
        action={
          <Button onClick={() => setEditing('new')} className="h-10 px-4 text-sm">
            <Plus className="size-4" aria-hidden />
            추가
          </Button>
        }
      />
      <div className="flex">
        <Segmented value={kind} onChange={setKind} ariaLabel="지출 또는 수입" options={[{ value: 'expense', label: '지출' }, { value: 'income', label: '수입' }]} />
      </div>
      <ul className="divide-y divide-line rounded-2xl bg-surface px-4">
        {list.map((c, i) => (
          <li key={c.id} className="flex items-center gap-3 py-2.5">
            <button type="button" onClick={() => setEditing(c)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <CategoryIcon category={c} />
              <span className="truncate font-medium">{c.name}</span>
            </button>
            <MoveButtons label={c.name} onUp={i > 0 ? () => move(i, i - 1) : undefined} onDown={i < list.length - 1 ? () => move(i, i + 1) : undefined} />
          </li>
        ))}
      </ul>
      {archived.length ? (
        <section>
          <h2 className="mb-2 px-1 text-sm font-medium text-muted">보관함</h2>
          <ul className="divide-y divide-line rounded-2xl bg-surface px-4">
            {archived.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setEditing(c)} className="flex w-full items-center gap-3 py-2.5 text-left text-muted">
                  <CategoryIcon category={c} size="sm" />
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {editing ? <CategoryForm initial={editing === 'new' ? null : editing} kind={kind} nextSort={data.categories.length} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function CategoryForm({ initial, kind, nextSort, onClose }: { initial: Category | null; kind: CategoryKind; nextSort: number; onClose: () => void }) {
  const household = useCurrentHousehold();
  const data = useData();
  const { save, remove } = useMutations();
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? '📦');
  const [color, setColor] = useState(initial?.color ?? COLORS[0]!);
  const [archived, setArchived] = useState(initial?.archived ?? false);
  const used = initial ? data.transactions.filter((t) => t.splits.some((s) => s.category_id === initial.id)).length : 0;

  const submit = async () => {
    await save('categories', {
      ...(initial ?? { ...baseRow(household.householdId), kind, sort: nextSort, parent_id: null }),
      name: name.trim(),
      icon,
      color,
      archived,
    });
    onClose();
  };

  const destroy = async () => {
    if (!initial) return;
    if (used > 0) {
      window.alert(`이 카테고리로 기록한 내역이 ${used}건 있어 지울 수 없습니다. 대신 ‘보관’하면 입력할 때 보이지 않습니다.`);
      return;
    }
    if (!window.confirm(`${initial.name}을(를) 지울까요?`)) return;
    await remove('categories', initial);
    onClose();
  };

  return (
    <Sheet
      title={initial ? '카테고리 고치기' : `${kind === 'expense' ? '지출' : '수입'} 카테고리 추가`}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {initial ? (
            <Button variant="danger" onClick={() => void destroy()}>
              지우기
            </Button>
          ) : null}
          <Button block disabled={!name.trim()} onClick={() => void submit()}>
            저장
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <div className="flex items-center gap-3">
          <CategoryIcon category={{ icon, color } as Category} size="lg" />
          <Labeled label="이름">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} className={inputClass} />
          </Labeled>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-muted">아이콘</p>
          <div className="grid grid-cols-8 gap-1">
            {ICONS.map((i) => (
              <button key={i} type="button" aria-pressed={i === icon} onClick={() => setIcon(i)} className={`flex aspect-square items-center justify-center rounded-lg text-xl ${i === icon ? 'bg-brand-soft ring-2 ring-brand' : ''}`}>
                {i}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-muted">색</p>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button key={c} type="button" aria-label={c} aria-pressed={c === color} onClick={() => setColor(c)} className={`size-8 rounded-full ${c === color ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface' : ''}`} style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
        {initial ? (
          <label className="flex items-center gap-3 py-1">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="size-5 accent-[var(--app-brand)]" />
            <span>보관 (입력할 때 안 보임, 예전 내역은 그대로)</span>
          </label>
        ) : null}
      </div>
    </Sheet>
  );
}
