import type { PaymentMethod } from '@moayo/core';
import { ArrowDownUp, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui.tsx';
import { useData } from '../../data/dataContext.ts';
import { useMutations } from '../../data/mutations.ts';
import { AssetEditor, AssetList, OwnerFilter } from '../../manage/AssetManager.tsx';
import { SettingsHeader } from './common.tsx';
import { PaymentLabels } from './PaymentLabels.tsx';

/** 더보기 → 자산: 입력 화면 연필과 같은 자산설정 화면. */
export function PaymentMethodsPage() {
  const data = useData();
  const { save } = useMutations();
  const [editing, setEditing] = useState<PaymentMethod | 'new' | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [owner, setOwner] = useState<string | 'all'>('all');
  const archived = data.paymentMethods.filter((p) => p.archived);

  return (
    <div className="space-y-4">
      <SettingsHeader
        title="자산"
        action={
          <div className="flex gap-2">
            <Button variant={ordering ? 'primary' : 'secondary'} onClick={() => setOrdering((o) => !o)} className="h-10 px-3 text-sm">
              <ArrowDownUp className="size-4" aria-hidden />
              {ordering ? '완료' : '순서'}
            </Button>
            <Button onClick={() => setEditing('new')} className="h-10 px-4 text-sm">
              <Plus className="size-4" aria-hidden />
              추가
            </Button>
          </div>
        }
      />
      <PaymentLabels />
      <div className="-mx-4 overflow-hidden md:mx-0 md:rounded-2xl">
        <OwnerFilter value={owner} onChange={setOwner} />
        <AssetList ordering={ordering} onEdit={setEditing} ownerFilter={owner} />
      </div>
      {archived.length ? (
        <section>
          <h2 className="mb-2 px-1 text-sm font-normal text-muted">지운 자산 (누르면 되살리기)</h2>
          <div className="flex flex-wrap gap-2">
            {archived.map((p) => (
              <button key={p.id} type="button" onClick={() => void save('payment_methods', { ...p, archived: false })} className="press h-9 rounded-full bg-surface px-3 text-sm text-muted">
                {p.name}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {editing ? <AssetEditor initial={editing === 'new' ? null : editing} defaultOwnerId={owner !== 'all' ? owner : null} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
