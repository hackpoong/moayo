import { ArrowLeftRight, ChevronRight, CreditCard, Download, Hash, LayoutGrid, LogOut, Sparkles, Wand2, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { SyncBadge } from '../components/SyncBadge.tsx';
import { Button, Card } from '../components/ui.tsx';
import { deleteLocalDb } from '../data/localDb.ts';
import { useAuth, useSession } from '../lib/authContext.ts';
import { clearHouseholdCache, useCurrentHousehold, useHouseholds } from '../lib/householdContext.ts';
import { People } from './People.tsx';
import { AiUsagePreview } from './settings/AiUsage.tsx';

const SETTINGS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/more/payment-methods', label: '자산', icon: CreditCard },
  { to: '/more/categories', label: '분류', icon: LayoutGrid },
  { to: '/more/tags', label: '태그', icon: Hash },
  { to: '/more/transfer-rules', label: '이체(지출 아님) 대상', icon: ArrowLeftRight },
  { to: '/more/rename-rules', label: '자동 바꾸기 규칙', icon: Wand2 },
  { to: '/more/export', label: '내보내기·백업', icon: Download },
  { to: '/more/ai-usage', label: 'AI 사용량·비용', icon: Sparkles },
];

export function More() {
  const session = useSession();
  const { signOut } = useAuth();
  const household = useCurrentHousehold();
  const { memberships, select } = useHouseholds();

  const leave = async () => {
    if (!window.confirm('로그아웃할까요? 이 기기에 저장된 가계부 사본도 지웁니다(서버에는 그대로 남습니다).')) return;
    clearHouseholdCache(session.user.id);
    await deleteLocalDb(session.user.id).catch(() => undefined);
    await signOut();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">더보기</h1>
        <SyncBadge always />
      </div>

      <People />

      <nav className="divide-y divide-line rounded-2xl bg-surface px-4" aria-label="설정">
        {SETTINGS.map((item) => (
          <Link key={item.to} viewTransition to={item.to} className="flex h-13 items-center gap-3">
            <item.icon className="size-5 text-muted" aria-hidden />
            <span className="flex-1 font-semibold">{item.label}</span>
            {item.to === '/more/ai-usage' ? <AiUsagePreview /> : null}
            <ChevronRight className="size-5 text-muted" aria-hidden />
          </Link>
        ))}
      </nav>

      {memberships.length > 1 ? (
        <Card>
          <h2 className="font-semibold">가계부 바꾸기</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {memberships.map((m) => (
              <button
                key={m.householdId}
                type="button"
                onClick={() => select(m.householdId)}
                className={`h-10 rounded-full px-4 text-sm font-semibold ${m.householdId === household.householdId ? 'bg-brand text-brand-fg' : 'bg-surface-2'}`}
              >
                {m.householdName}
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <p className="truncate text-sm font-normal text-muted">{session.user.email}</p>
        <Button variant="ghost" onClick={() => void leave()} className="-ml-3 mt-1">
          <LogOut className="size-5" aria-hidden />
          로그아웃
        </Button>
      </Card>
    </div>
  );
}
