import { Trash2 } from 'lucide-react';
import { EmptyState } from '../../components/bits.tsx';
import { useData } from '../../data/dataContext.ts';
import { useMutations } from '../../data/mutations.ts';
import { assetIcon } from '../../lib/assets.ts';
import { SettingsHeader } from './common.tsx';

/** '앞으로도 계속 바꾸기'로 만든 규칙들. */
export function RenameRulesPage() {
  const data = useData();
  const { remove } = useMutations();
  return (
    <div className="space-y-4">
      <SettingsHeader title="자동 바꾸기 규칙" />
      <p className="px-1 text-sm font-normal text-muted">
        내역을 고친 뒤 ‘앞으로도 계속 바꾸기’를 고르면 여기에 남습니다. 사진·문자로 이 이름이 들어오면 제목·분류·자산을 바꿔 넣고, 원래 이름은 메모에
        남깁니다.
      </p>
      {data.merchantRules.length === 0 ? <EmptyState title="아직 규칙이 없습니다" /> : null}
      <ul className="divide-y divide-line rounded-2xl bg-surface px-4">
        {data.merchantRules.map((r) => {
          const cat = r.set_category_id ? data.byId.category.get(r.set_category_id) : null;
          const pm = r.set_payment_method_id ? data.byId.paymentMethod.get(r.set_payment_method_id) : null;
          return (
            <li key={r.id} className="flex items-center gap-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">‘{r.match_key}’</p>
                <p className="truncate text-[13px] font-normal text-muted">
                  → {[r.set_merchant, cat ? `${cat.icon ?? ''}${cat.name}` : null, pm ? `${assetIcon(pm)}${pm.name}` : null].filter(Boolean).join(' · ')}
                </p>
              </div>
              <button type="button" aria-label="규칙 지우기" onClick={() => void remove('merchant_rules', r)} className="press rounded-full p-2 text-muted">
                <Trash2 className="size-5" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
