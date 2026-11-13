import { useState } from 'react';
import { Button, CenteredPage, ErrorNote, Logo } from '../components/ui.tsx';
import { useAuth } from '../lib/authContext.ts';
import { describeError } from '../lib/supabase.ts';

interface LoginProps {
  /** 로그인한 뒤 돌아올 경로. */
  returnPath?: string;
  /** 초대 링크로 들어왔을 때 보여 줄 안내. */
  notice?: string;
}

export function Login({ returnPath = '/', notice }: LoginProps) {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle(returnPath);
      // 성공하면 Google 로그인 화면으로 넘어가므로 여기서 더 할 일은 없다.
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  };

  return (
    <CenteredPage>
      <Logo />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">모아요</h1>
        <p className="mt-2 text-lg text-muted">가족이 함께 쓰는 가계부</p>
      </div>
      {notice ? <p className="rounded-xl bg-brand-soft px-4 py-3 text-sm text-fg">{notice}</p> : null}
      <ErrorNote>{error}</ErrorNote>
      <Button block busy={busy} onClick={start}>
        Google 계정으로 시작하기
      </Button>
      <p className="text-center text-xs leading-relaxed text-muted">
        가계부 내용은 같은 가족으로 등록된 사람만 볼 수 있습니다.
      </p>
    </CenteredPage>
  );
}
