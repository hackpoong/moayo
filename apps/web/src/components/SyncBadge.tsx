import { CloudOff, RefreshCw, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSyncStatus } from '../data/dataContext.ts';
import { useMutations } from '../data/mutations.ts';

/** 문제가 있을 때만 보이는 동기화 상태. 평소에는 아무것도 안 보인다. */
export function SyncBadge({ always = false }: { always?: boolean }) {
  const status = useSyncStatus();
  const { retryFailed } = useMutations();
  // 보통 저장은 1초 안에 끝난다. 매번 '저장 중'이 깜빡이면 느려 보이므로 2.5초 넘게 밀릴 때만 보인다.
  const pending = status.pendingCount > 0;
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) {
      const t = window.setTimeout(() => setSlow(false), 0);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setSlow(true), 2500);
    return () => window.clearTimeout(t);
  }, [pending]);

  if (status.state === 'offline') {
    return (
      <Pill tone="muted" icon={<CloudOff className="size-3.5" aria-hidden />}>
        오프라인{status.pendingCount ? ` · ${status.pendingCount}건 대기` : ''}
      </Pill>
    );
  }
  if (status.state === 'error') {
    return (
      <button type="button" onClick={() => void retryFailed()} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-expense/10 px-3 text-xs font-medium text-expense">
        <TriangleAlert className="size-3.5" aria-hidden />
        {status.error ?? '동기화 오류'} · 다시 시도
      </button>
    );
  }
  if ((pending && slow) || (!status.initialized && status.state === 'syncing')) {
    return (
      <Pill tone="muted" icon={<RefreshCw className="size-3.5 animate-spin" aria-hidden />}>
        {status.initialized ? '저장 중' : '가계부 불러오는 중'}
      </Pill>
    );
  }
  if (always) {
    return <Pill tone="muted">{status.lastSyncedAt ? `동기화됨 · ${new Date(status.lastSyncedAt).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}` : '동기화 대기'}</Pill>;
  }
  return null;
}

function Pill({ children, icon, tone }: { children: React.ReactNode; icon?: React.ReactNode; tone: 'muted' }) {
  return (
    <span role="status" className={`inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-xs font-medium ${tone === 'muted' ? 'text-muted' : ''}`}>
      {icon}
      {children}
    </span>
  );
}
