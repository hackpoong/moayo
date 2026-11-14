import { lazy, Suspense, type ComponentType } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { Splash } from '../components/ui.tsx';
import { useAuth } from '../lib/authContext.ts';
import { HouseholdProvider } from '../lib/household.tsx';
import { useHouseholds } from '../lib/householdContext.ts';
import { supabase } from '../lib/supabase.ts';
import { Home } from '../pages/Home.tsx';
import { Login } from '../pages/Login.tsx';
import { Onboarding } from '../pages/Onboarding.tsx';
import { SetupNeeded } from '../pages/SetupNeeded.tsx';
import { Shell } from './Shell.tsx';

// 첫 화면(홈)에 필요 없는 화면은 따로 나눠 받는다. 첫 화면이 뜬 뒤 한가할 때 모두 미리 받아 둔다.
const prefetchers: (() => Promise<unknown>)[] = [];
function page<M>(load: () => Promise<M>, pick: (m: M) => ComponentType) {
  prefetchers.push(load);
  return lazy(() => load().then((m) => ({ default: pick(m) })));
}
const Transactions = page(() => import('../pages/Transactions.tsx'), (m) => m.Transactions);
const CalendarPage = page(() => import('../pages/CalendarPage.tsx'), (m) => m.CalendarPage);
const Stats = page(() => import('../pages/Stats.tsx'), (m) => m.Stats);
const More = page(() => import('../pages/More.tsx'), (m) => m.More);
const Join = page(() => import('../pages/Join.tsx'), (m) => m.Join);
const AiUsagePage = page(() => import('../pages/settings/AiUsage.tsx'), (m) => m.AiUsagePage);
const CategoriesPage = page(() => import('../pages/settings/Categories.tsx'), (m) => m.CategoriesPage);
const ExportPage = page(() => import('../pages/settings/Export.tsx'), (m) => m.ExportPage);
const PaymentMethodsPage = page(() => import('../pages/settings/PaymentMethods.tsx'), (m) => m.PaymentMethodsPage);
const TagsPage = page(() => import('../pages/settings/Tags.tsx'), (m) => m.TagsPage);
const TransferRulesPage = page(() => import('../pages/settings/TransferRules.tsx'), (m) => m.TransferRulesPage);
const RenameRulesPage = page(() => import('../pages/settings/RenameRules.tsx'), (m) => m.RenameRulesPage);
const RecurringPage = page(() => import('../pages/settings/Recurring.tsx'), (m) => m.RecurringPage);

if (typeof window !== 'undefined') {
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
  idle(() => prefetchers.forEach((load) => void load()));
}

export function App() {
  if (!supabase) return <SetupNeeded />;
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<RequireAuth />}>
          <Route
            path="/join/:code"
            element={
              <Suspense fallback={<Splash />}>
                <Join />
              </Suspense>
            }
          />
          <Route path="/welcome" element={<RequireNoHousehold />} />
          <Route element={<RequireHousehold />}>
            <Route index element={<Home />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/more/payment-methods" element={<PaymentMethodsPage />} />
            <Route path="/more/categories" element={<CategoriesPage />} />
            <Route path="/more/rename-rules" element={<RenameRulesPage />} />
            <Route path="/more/recurring" element={<RecurringPage />} />
            <Route path="/more/tags" element={<TagsPage />} />
            <Route path="/more/transfer-rules" element={<TransferRulesPage />} />
            <Route path="/more/export" element={<ExportPage />} />
            <Route path="/more/ai-usage" element={<AiUsagePage />} />
            <Route path="/more" element={<More />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

/** 로그인하지 않았으면 그 자리에서 로그인 화면을 보여 주고, 로그인 뒤 같은 주소로 돌아온다. */
function RequireAuth() {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === 'loading') return <Splash />;
  if (state.status === 'signedOut') {
    const invited = location.pathname.startsWith('/join/');
    return (
      <Login
        returnPath={invited ? location.pathname : '/'}
        notice={invited ? '가족 가계부 초대를 받았습니다. 로그인하면 바로 합류할 수 있습니다.' : undefined}
      />
    );
  }
  return (
    <HouseholdProvider>
      <Outlet />
    </HouseholdProvider>
  );
}

function RequireHousehold() {
  const { loading, current } = useHouseholds();
  if (loading) return <Splash />;
  if (!current) return <Navigate to="/welcome" replace />;
  return <Shell />;
}

function RequireNoHousehold() {
  const { loading, current } = useHouseholds();
  if (loading) return <Splash />;
  if (current) return <Navigate to="/" replace />;
  return <Onboarding />;
}
