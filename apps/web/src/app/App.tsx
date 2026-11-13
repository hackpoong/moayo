import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { Splash } from '../components/ui.tsx';
import { useAuth } from '../lib/authContext.ts';
import { HouseholdProvider } from '../lib/household.tsx';
import { useHouseholds } from '../lib/householdContext.ts';
import { supabase } from '../lib/supabase.ts';
import { ComingSoon } from '../pages/ComingSoon.tsx';
import { Home } from '../pages/Home.tsx';
import { Join } from '../pages/Join.tsx';
import { Login } from '../pages/Login.tsx';
import { More } from '../pages/More.tsx';
import { Onboarding } from '../pages/Onboarding.tsx';
import { SetupNeeded } from '../pages/SetupNeeded.tsx';
import { Shell } from './Shell.tsx';

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
            <Route path="/transactions" element={<ComingSoon title="내역" description="날짜별 수입·지출 목록과 검색이 들어올 자리입니다." />} />
            <Route path="/calendar" element={<ComingSoon title="달력" description="날짜별 합계를 달력으로 보는 화면이 들어올 자리입니다." />} />
            <Route path="/stats" element={<ComingSoon title="통계" description="카테고리·구성원·결제수단별 통계가 들어올 자리입니다." />} />
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
