import { formatWon, recurringDate } from '@moayo/core';
import { Pause, Play, Trash2 } from 'lucide-react';
import { EmptyState } from '../../components/bits.tsx';
import { useData } from '../../data/dataContext.ts';
import { useMutations } from '../../data/mutations.ts';
import { assetIcon } from '../../lib/assets.ts';
import { SettingsHeader } from './common.tsx';

/** 정기 지출: 매달 자동으로 기록되는 것들. */
export function RecurringPage() {
  const data = useData();
  const { save, remove } = useMutations();
  const nextOf = (last: string | null, start: string) => {
    const [y, m] = (last ?? start).split('-').map(Number) as [number, number];
    if (!last) return start;
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  };
  return (
    <div className="space-y-4">
      <SettingsHeader title="정기 지출" />
      <p className="px-1 text-sm font-normal text-muted">내역을 입력할 때 날짜 줄 오른쪽 ‘반복/할부’에서 매달 반복을 켜면 여기에 생깁니다. 정한 날이 되면 앱을 열 때 자동으로 기록됩니다.</p>
      {data.recurringRules.length === 0 ? <EmptyState title="정기 지출이 없습니다" /> : null}
      <ul className="divide-y divide-line rounded-2xl bg-surface px-4">
        {data.recurringRules.map((r) => {
          const t = r.template;
          const cat = t.splits[0]?.category_id ? data.byId.category.get(t.splits[0].category_id) : null;
          const pm = t.payment_method_id ? data.byId.paymentMethod.get(t.payment_method_id) : null;
          const who = (pm?.owner_member_id ?? t.member_id) ? data.byId.member.get((pm?.owner_member_id ?? t.member_id)!) : null;
          return (
            <li key={r.id} className={`flex items-center gap-2 py-3 ${r.paused ? 'opacity-50' : ''}`}>
              <span className="text-xl" aria-hidden>
                {cat?.icon ?? '🔁'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {t.merchant ?? cat?.name ?? '정기 지출'} · {formatWon(t.amount)}
                </p>
                <p className="flex items-center gap-1 truncate text-[13px] font-normal text-muted">
                  매달 {r.day_of_month}일{r.times ? ` · ${r.times}회` : ''} ·{' '}
                  {r.paused ? '멈춤' : `다음 ${recurringDate(r, nextOf(r.last_generated_month, r.start_month)).slice(5).replace('-', '.')}`}
                  {pm ? `${assetIcon(pm)}${pm.name}` : who ? `${who.display_name}` : ''}
                </p>
              </div>
              <button type="button" aria-label={r.paused ? '다시 하기' : '멈추기'} onClick={() => void save('recurring_rules', { ...r, paused: !r.paused })} className="press rounded-full p-2 text-muted">
                {r.paused ? <Play className="size-5" aria-hidden /> : <Pause className="size-5" aria-hidden />}
              </button>
              <button
                type="button"
                aria-label="지우기"
                onClick={() => window.confirm('이 정기 지출을 지울까요? 이미 기록된 내역은 그대로 남습니다.') && void remove('recurring_rules', r)}
                className="press rounded-full p-2 text-muted"
              >
                <Trash2 className="size-5" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
