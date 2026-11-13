import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** 환경변수가 없으면 null. 이때는 설정 안내 화면을 보여 준다. */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

/** supabase 가 설정된 화면에서만 부른다. */
export function db(): SupabaseClient {
  if (!supabase) throw new Error('Supabase 환경변수가 설정되지 않았습니다.');
  return supabase;
}

/** 서버 오류를 사용자에게 보여 줄 한국어 문장으로 바꾼다. */
export function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : '';
  if (/invalid or expired invite/i.test(message)) return '초대 코드가 틀렸거나 만료되었습니다. 새 초대 링크를 받아 주세요.';
  if (/only the owner/i.test(message)) return '가족을 만든 사람만 할 수 있는 작업입니다.';
  if (/too many households/i.test(message)) return '한 계정으로 만들 수 있는 가족 수를 넘었습니다.';
  if (/Failed to fetch|NetworkError|network/i.test(message)) return '인터넷에 연결되지 않았습니다. 연결을 확인한 뒤 다시 시도해 주세요.';
  return message ? `문제가 생겼습니다: ${message}` : '문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.';
}
