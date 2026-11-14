import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { Splash } from '../components/ui.tsx';
import { useAuth } from '../lib/authContext.ts';
import { HouseholdProvider } from '../lib/household.tsx';
import { useHouseholds } from '../lib/householdContext.ts';
import { supabase } from '../lib/supabase.ts';
import { CalendarPage } from '../pages/CalendarPage.tsx';
import { Home } from '../pages/Home.tsx';
import { Join } from '../pages/Join.tsx';
import { Login } from '../pages/Login.tsx';
import { More } from '../pages/More.tsx';
import { Onboarding } from '../pages/Onboarding.tsx';
import { AiUsagePage } from '../pages/settings/AiUsage.tsx';
import { CategoriesPage } from '../pages/settings/Categories.tsx';
import { ExportPage } from '../pages/settings/Export.tsx';
import { PaymentMethodsPage } from '../pages/settings/PaymentMethods.tsx';
import { TagsPage } from '../pages/settings/Tags.tsx';
import { TransferRulesPage } from '../pages/settings/TransferRules.tsx';
import { SetupNeeded } from '../pages/SetupNeeded.tsx';
import { Transactions } from '../pages/Transactions.tsx';
import { Shell } from './Shell.tsx';

const loadStats = () => import('../pages/Stats.tsx');
const Stats = lazy(() => loadStats().then((m) => ({ default: m.Stats })));

// 첫 화면이 뜬 뒤 한가할 때 통계 화면을 미리 받아 둔다(누르는 순간 바로 뜨게).
if (typeof window !== 'undefined') {
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
  idle(() => void loadStats());
}

export function App() {
  if (!supabase) return <SetupNeeded />;
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<RequireAuth />}>
          <Route path="/join/:code" element={<Join />} />
          <Route path="/welcome" element={<RequireNoHousehold />} />
          <Route element={<RequireHousehold />}>
            <Route index element={<Home />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route
              path="/stats"
              element={
                <Suspense fallback={<p className="py-10 text-center text-sm text-muted">불러오는 중…</p>}>
                  <Stats />
                </Suspense>
              }
            />
            <Route path="/more/payment-methods" element={<PaymentMethodsPage />} />
            <Route path="/more/categories" element={<CategoriesPage />} />
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
