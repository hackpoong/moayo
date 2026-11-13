import type { Session } from '@supabase/supabase-js';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AuthContext, type AuthContextValue, type AuthState } from './authContext.ts';
import { supabase } from './supabase.ts';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => (supabase ? { status: 'loading' } : { status: 'signedOut' }));

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const apply = (session: Session | null) => {
      if (active) setState(session ? { status: 'signedIn', session } : { status: 'signedOut' });
    };
    // 저장된 세션은 기기에서 바로 읽으므로 다시 열 때 로그인 화면이 깜빡이지 않는다.
    void supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => apply(session));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      async signInWithGoogle(returnPath = '/') {
        if (!supabase) return;
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: `${window.location.origin}${returnPath}` },
        });
        if (error) throw error;
      },
      async signOut() {
        await supabase?.auth.signOut();
      },
    }),
    [state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
