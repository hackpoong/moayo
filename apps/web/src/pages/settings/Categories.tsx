import type { Category, CategoryKind } from '@moayo/core';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Segmented } from '../../components/bits.tsx';
import { Button } from '../../components/ui.tsx';
import { useData } from '../../data/dataContext.ts';
import { useMutations } from '../../data/mutations.ts';
import { CategoryList, CategoryNameSheet } from '../../manage/CategoryManager.tsx';
import { SettingsHeader } from './common.tsx';

/** 더보기 → 분류: 입력 화면 연필과 같은 편집 화면. */
export function CategoriesPage() {
  const data = useData();
  const { save } = useMutations();
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const archived = data.categories.filter((c) => c.kind === kind && c.archived && !c.deleted_at);

  return (
    <div className="space-y-4">
      <SettingsHeader
        title="분류"
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
      <div className="overflow-hidden rounded-2xl bg-surface">
        <CategoryList kind={kind} onEdit={setEditing} />
      </div>
      {archived.length ? (
        <section>
          <h2 className="mb-2 px-1 text-sm font-normal text-muted">지운 분류 (누르면 되살리기)</h2>
          <div className="flex flex-wrap gap-2">
            {archived.map((c) => (
              <button key={c.id} type="button" onClick={() => void save('categories', { ...c, archived: false })} className="press h-9 rounded-full bg-surface px-3 text-sm text-muted">
                {c.icon} {c.name}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {editing ? <CategoryNameSheet kind={kind} category={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
