import type { Session } from '@supabase/supabase-js';
import { createContext, useContext } from 'react';

export type AuthState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; session: Session };

export interface AuthContextValue {
  state: AuthState;
  signInWithGoogle: (returnPath?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthProvider 밖에서 useAuth 를 불렀습니다.');
  return ctx;
}

/** 로그인된 화면에서만 쓴다. */
export function useSession(): Session {
  const { state } = useAuth();
  if (state.status !== 'signedIn') throw new Error('로그인이 필요합니다.');
  return state.session;
}

/** Google 계정 이름. 표시 이름의 기본값으로 쓴다. */
export function defaultDisplayName(session: Session): string {
  const meta = session.user.user_metadata as Record<string, unknown>;
  const name = [meta.name, meta.full_name].find((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return (name ?? session.user.email?.split('@')[0] ?? '').trim().slice(0, 20);
}
