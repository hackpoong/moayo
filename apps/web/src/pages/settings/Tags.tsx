import type { Tag } from '@moayo/core';
import { useState, type FormEvent } from 'react';
import { EmptyState } from '../../components/bits.tsx';
import { Button } from '../../components/ui.tsx';
import { useData } from '../../data/dataContext.ts';
import { baseRow, useMutations } from '../../data/mutations.ts';
import { useCurrentHousehold } from '../../lib/householdContext.ts';
import { SettingsHeader } from './common.tsx';
import { inputClass } from './util.ts';

export function TagsPage() {
  const data = useData();
  const household = useCurrentHousehold();
  const { save, remove } = useMutations();
  const [name, setName] = useState('');
  const counts = new Map<string, number>();
  for (const tx of data.transactions) for (const t of tx.tag_ids) counts.set(t, (counts.get(t) ?? 0) + 1);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim().replace(/^#/, '');
    if (!n || data.tags.some((t) => t.name === n)) return;
    await save('tags', { ...baseRow(household.householdId), name: n });
    setName('');
  };

  const rename = async (tag: Tag) => {
    const next = window.prompt('새 이름', tag.name)?.trim().replace(/^#/, '');
    if (next && next !== tag.name) await save('tags', { ...tag, name: next });
  };

  const destroy = async (tag: Tag) => {
    const n = counts.get(tag.id) ?? 0;
    if (!window.confirm(n ? `#${tag.name} 태그를 지울까요? 내역 ${n}건에서 빠집니다.` : `#${tag.name} 태그를 지울까요?`)) return;
    for (const tx of data.transactions) {
      if (tx.tag_ids.includes(tag.id)) await save('transactions', { ...tx, tag_ids: tx.tag_ids.filter((t) => t !== tag.id) });
    }
    await remove('tags', tag);
  };

  return (
    <div className="space-y-4">
      <SettingsHeader title="태그" />
      <p className="px-1 text-sm text-muted">카테고리와 따로, 여러 내역을 묶어 볼 때 씁니다. 예: #제주여행 #이사 #명절</p>
      <form onSubmit={add} className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="새 태그 이름" maxLength={30} className={inputClass} />
        <Button type="submit" disabled={!name.trim()}>
          추가
        </Button>
      </form>
      {data.tags.length === 0 ? (
        <EmptyState title="태그가 없습니다" />
      ) : (
        <ul className="divide-y divide-line rounded-2xl bg-surface px-4">
          {data.tags.map((t) => (
            <li key={t.id} className="flex items-center gap-2 py-3">
              <span className="flex-1 font-medium">#{t.name}</span>
              <span className="text-sm text-muted">{counts.get(t.id) ?? 0}건</span>
              <button type="button" onClick={() => void rename(t)} className="px-2 text-sm text-muted">
                이름 바꾸기
              </button>
              <button type="button" onClick={() => void destroy(t)} className="px-2 text-sm text-expense">
                지우기
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
