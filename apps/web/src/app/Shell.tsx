import { CalendarDays, ChartPie, Ellipsis, House, ImagePlus, List, Plus, type LucideIcon } from 'lucide-react';
import { lazy, Suspense, useCallback, useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { SyncBadge } from '../components/SyncBadge.tsx';
import { ToastProvider } from '../components/Toast.tsx';
import { AddMenu } from '../components/AddMenu.tsx';
import { BulkRenameProvider } from '../bulk/BulkRename.tsx';
import { SelectionProvider } from '../bulk/Selection.tsx';
import { Logo } from '../components/ui.tsx';
import { DataProvider } from '../data/DataProvider.tsx';
import { useRecurringGenerator } from '../data/useRecurringGenerator.ts';
import { useClipboardOffer, useSharedInbox } from '../lib/inbound.ts';
import { useToast } from '../components/toastContext.ts';
import { EditorContext, type EditorRequest } from '../editor/editorContext.ts';
import { useSession } from '../lib/authContext.ts';
import { useCurrentHousehold } from '../lib/householdContext.ts';

interface Tab {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** 고른 탭에서 아이콘 안을 채울지(선 아이콘만인 것은 안 채움). */
  fill?: boolean;
}

// 입력 화면·불러오기 화면은 따로 받는다(첫 화면을 가볍게). 한가할 때 미리 받아 두어 + 를 누르면 바로 뜬다.
const loadEditor = () => import('../editor/TransactionEditor.tsx');
const loadImport = () => import('../editor/ImportSheet.tsx');
const TransactionEditor = lazy(() => loadEditor().then((m) => ({ default: m.TransactionEditor })));
const ImportSheet = lazy(() => loadImport().then((m) => ({ default: m.ImportSheet })));
if (typeof window !== 'undefined') {
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 800));
  idle(() => {
    void loadEditor();
    void loadImport();
  });
}

const TABS: Tab[] = [
  { to: '/', label: '홈', icon: House, end: true, fill: true },
  { to: '/transactions', label: '내역', icon: List },
  { to: '/calendar', label: '달력', icon: CalendarDays, fill: true },
  { to: '/stats', label: '통계', icon: ChartPie, fill: true },
  { to: '/more', label: '더보기', icon: Ellipsis },
];

/** 로그인 후 화면의 틀. 가족이 바뀌면 데이터 계층을 새로 만든다. */
export function Shell() {
  const session = useSession();
  const household = useCurrentHousehold();
  return (
    <DataProvider key={household.householdId} userId={session.user.id} householdId={household.householdId}>
      <ToastProvider>
        <BulkRenameProvider>
          <SelectionProvider>
            <ShellLayout />
          </SelectionProvider>
        </BulkRenameProvider>
      </ToastProvider>
    </DataProvider>
  );
}

function ShellLayout() {
  const household = useCurrentHousehold();
  useRecurringGenerator();
  const [editor, setEditor] = useState<{ key: number; request: EditorRequest } | null>(null);
  const openEditor = useCallback((request: EditorRequest = {}) => setEditor({ key: Date.now(), request }), []);
  const closeEditor = useCallback(() => setEditor(null), []);
  const toast = useToast();
  useSharedInbox(openEditor);
  useClipboardOffer(openEditor, toast);

  return (
    <EditorContext.Provider value={openEditor}>
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 border-r border-line p-4 md:flex">
          <div className="mb-4 flex items-center gap-3 px-2">
            <Logo className="size-9" />
            <div className="min-w-0">
              <p className="font-bold leading-tight">모아요</p>
              <p className="truncate text-xs text-muted">{household.householdName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openEditor()}
            className="mb-3 flex h-11 items-center justify-center gap-2 rounded-xl bg-brand font-semibold text-brand-fg active:opacity-80"
          >
            <Plus className="size-5" aria-hidden />
            내역 추가
          </button>
          <button
            type="button"
            onClick={() => openEditor({ importMode: 'image' })}
            className="mb-3 flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-soft text-sm font-semibold text-brand"
          >
            <ImagePlus className="size-4" aria-hidden />
            사진·문자로 넣기
          </button>
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              viewTransition
              className={({ isActive }) =>
                `flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium ${isActive ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2'}`
              }
            >
              <tab.icon className="size-5" aria-hidden />
              {tab.label}
            </NavLink>
          ))}
          <div className="mt-auto px-2">
            <SyncBadge always />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <main className="pt-safe flex-1">
            <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-5 md:pb-10 md:pt-8">
              <div className="mb-2 flex justify-end empty:hidden md:hidden">
                <SyncBadge />
              </div>
              <Suspense fallback={<div className="py-16" aria-busy="true" />}>
                <Outlet />
              </Suspense>
            </div>
          </main>

          <AddMenu open={openEditor} />

          <nav className="vt-tabbar pb-safe fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 backdrop-blur md:hidden" aria-label="주 메뉴">
            <ul className="mx-auto flex max-w-2xl">
              {TABS.map((tab) => (
                <li key={tab.to} className="flex-1">
                  <NavLink
                    to={tab.to}
                    end={tab.end}
                    viewTransition
                    className={({ isActive }) =>
                      `flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] ${isActive ? 'font-bold text-brand' : 'font-medium text-muted'}`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {/* 고른 탭: 아이콘 뒤 연한 알약 + 채운 아이콘 */}
                        <span className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${isActive ? 'bg-brand-soft' : ''}`}>
                          <tab.icon className="size-6" fill={isActive && tab.fill ? 'currentColor' : 'none'} fillOpacity={0.18} strokeWidth={isActive ? 2.25 : 2} aria-hidden />
                        </span>
                        {tab.label}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
      <Suspense fallback={null}>
      {editor?.request.importMode ? (
        <ImportSheet key={editor.key} initialMode={editor.request.importMode} initialText={editor.request.text} initialFiles={editor.request.files} onClose={closeEditor} />
      ) : editor ? (
        <TransactionEditor key={editor.key} request={editor.request} onClose={closeEditor} />
      ) : null}
      </Suspense>
    </EditorContext.Provider>
  );
}
