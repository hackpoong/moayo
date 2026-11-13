import { CalendarDays, ChartPie, Ellipsis, House, List, Plus, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { Logo } from '../components/ui.tsx';
import { useCurrentHousehold } from '../lib/householdContext.ts';
import { AddSheet } from './AddSheet.tsx';

interface Tab {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const TABS: Tab[] = [
  { to: '/', label: '홈', icon: House, end: true },
  { to: '/transactions', label: '내역', icon: List },
  { to: '/calendar', label: '달력', icon: CalendarDays },
  { to: '/stats', label: '통계', icon: ChartPie },
  { to: '/more', label: '더보기', icon: Ellipsis },
];

/** 로그인 후 화면의 틀. 휴대폰은 아래 탭, 넓은 화면은 왼쪽 사이드바. */
export function Shell() {
  const household = useCurrentHousehold();
  const [adding, setAdding] = useState(false);

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl">
      <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-line p-4 md:flex">
        <div className="mb-4 flex items-center gap-3 px-2">
          <Logo className="size-9" />
          <div className="min-w-0">
            <p className="font-bold leading-tight">모아요</p>
            <p className="truncate text-xs text-muted">{household.householdName}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mb-3 flex h-11 items-center justify-center gap-2 rounded-xl bg-brand font-semibold text-brand-fg active:opacity-80"
        >
          <Plus className="size-5" aria-hidden />
          내역 추가
        </button>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium ${isActive ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2'}`
            }
          >
            <tab.icon className="size-5" aria-hidden />
            {tab.label}
          </NavLink>
        ))}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="pt-safe min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-5 md:pb-10 md:pt-8">
            <Outlet />
          </div>
        </main>

        <button
          type="button"
          aria-label="내역 추가"
          onClick={() => setAdding(true)}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] right-4 flex size-14 items-center justify-center rounded-full bg-brand text-brand-fg shadow-lg shadow-black/20 active:scale-95 md:hidden"
        >
          <Plus className="size-7" aria-hidden />
        </button>

        <nav className="pb-safe fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 backdrop-blur md:hidden" aria-label="주 메뉴">
          <ul className="mx-auto flex max-w-2xl">
            {TABS.map((tab) => (
              <li key={tab.to} className="flex-1">
                <NavLink
                  to={tab.to}
                  end={tab.end}
                  className={({ isActive }) =>
                    `flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${isActive ? 'text-brand' : 'text-muted'}`
                  }
                >
                  <tab.icon className="size-6" aria-hidden />
                  {tab.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {adding ? <AddSheet onClose={() => setAdding(false)} /> : null}
    </div>
  );
}
