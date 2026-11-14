import { formatWon, groupActivity } from '@moayo/core';
import { ACTION_LABEL as ACTION, whenLabel } from '../lib/activity.ts';
import { useMemo, useState } from 'react';
import { useData } from '../data/dataContext.ts';
import { MemberBadge } from './MemberBadge.tsx';
import { Sheet } from './Sheet.tsx';

/** 누가 언제 불러오고 고쳤는지. txId 를 주면 그 내역만. */
export function ActivityLogSheet({ txId, onClose }: { txId?: string; onClose: () => void }) {
  const data = useData();
  const [limit, setLimit] = useState(60);
  const groups = useMemo(() => groupActivity(txId ? data.activity.filter((a) => a.tx_id === txId) : data.activity), [data.activity, txId]);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Sheet title={txId ? '이 내역의 기록' : '기록'} tall onClose={onClose}>
      {groups.length === 0 ? <p className="py-10 text-center text-sm text-muted">아직 기록이 없습니다.</p> : null}
      <ol className="divide-y divide-line">
        {groups.slice(0, limit).map((g) => {
          const who = g.member_id ? data.byId.member.get(g.member_id) : null;
          const first = g.entries[0]!;
          const many = g.entries.length > 1;
          return (
            <li key={g.key} className="py-3">
              <div className="flex items-center gap-2 text-[15px]">
                {who ? <MemberBadge member={who} size="md" /> : <span className="font-semibold text-muted">누군가</span>}
                <span className="font-semibold">
                  {many ? `${g.entries.length}건 ` : ''}
                  {ACTION[g.action]}
                </span>
                <span className="ml-auto shrink-0 text-xs font-normal text-muted">{whenLabel(g.at)}</span>
              </div>
              {many ? (
                <>
                  <button type="button" onClick={() => setOpen(open === g.key ? null : g.key)} className="mt-1 text-sm font-normal text-muted underline-offset-2">
                    {g.entries
                      .slice(0, 3)
                      .map((e) => e.tx_label ?? '이름 없음')
                      .join(', ')}
                    {g.entries.length > 3 ? ` 외 ${g.entries.length - 3}건` : ''} {open === g.key ? '접기' : '펼치기'}
                  </button>
                  {open === g.key ? (
                    <ul className="mt-1.5 space-y-1 text-sm font-normal">
                      {g.entries.map((e) => (
                        <li key={e.id} className="flex justify-between gap-2">
                          <span className="truncate">{e.tx_label ?? '이름 없음'}</span>
                          <span className="tabular shrink-0 text-muted">{e.amount ? formatWon(e.amount) : ''}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : (
                <p className="mt-0.5 text-sm font-normal text-muted">
                  {txId ? null : (
                    <>
                      <span className="text-fg">{first.tx_label ?? '이름 없음'}</span>
                      {first.amount ? ` · ${formatWon(first.amount)}` : ''}
                    </>
                  )}
                  {first.summary ? <span className="block">{first.summary}</span> : null}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {groups.length > limit ? (
        <button type="button" onClick={() => setLimit((n) => n + 60)} className="w-full py-3 text-sm font-semibold text-brand">
          더 보기
        </button>
      ) : null}
    </Sheet>
  );
}
