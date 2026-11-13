import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button, Card, CenteredPage, ErrorNote, Field } from '../components/ui.tsx';
import { defaultDisplayName, useAuth, useSession } from '../lib/authContext.ts';
import { useHouseholds } from '../lib/householdContext.ts';
import { extractInviteCode } from '../lib/invite.ts';
import { db, describeError } from '../lib/supabase.ts';

/** 아직 속한 가족이 없을 때: 새로 만들거나 초대 코드로 합류한다. */
export function Onboarding() {
  const session = useSession();
  const { signOut } = useAuth();
  const { refresh, select } = useHouseholds();
  const navigate = useNavigate();

  const [householdName, setHouseholdName] = useState('우리 가족');
  const [displayName, setDisplayName] = useState(() => defaultDisplayName(session));
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await db().rpc('create_household', {
      p_name: householdName.trim(),
      p_display_name: displayName.trim(),
    });
    if (rpcError) {
      setError(describeError(rpcError));
      setBusy(false);
      return;
    }
    await refresh();
    select(data as string);
    navigate('/', { replace: true });
  };

  const join = (event: FormEvent) => {
    event.preventDefault();
    const cleaned = extractInviteCode(code);
    if (cleaned) navigate(`/join/${cleaned}`);
  };

  return (
    <CenteredPage>
      <div>
        <h1 className="text-2xl font-bold">가계부를 시작해 볼까요?</h1>
        <p className="mt-2 text-muted">새 가족 가계부를 만들거나, 받은 초대 코드로 합류하세요.</p>
      </div>

      <Card>
        <form onSubmit={create} className="space-y-4">
          <h2 className="text-lg font-semibold">새 가족 가계부 만들기</h2>
          <Field
            label="가족 이름"
            value={householdName}
            onChange={(e) => setHouseholdName(e.target.value)}
            maxLength={40}
            required
          />
          <Field
            label="내 이름"
            hint="가족에게 보이는 이름입니다. 예: 엄마, 아빠, 지우"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={20}
            required
          />
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" block busy={busy} disabled={!householdName.trim() || !displayName.trim()}>
            만들기
          </Button>
        </form>
      </Card>

      <Card>
        <form onSubmit={join} className="space-y-4">
          <h2 className="text-lg font-semibold">초대 코드로 합류하기</h2>
          <Field
            label="초대 코드 또는 초대 링크"
            placeholder="예: ABCD2345EF"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
          />
          <Button type="submit" variant="secondary" block disabled={!extractInviteCode(code)}>
            다음
          </Button>
        </form>
      </Card>

      <button type="button" className="self-center text-sm text-muted underline" onClick={() => void signOut()}>
        다른 계정으로 로그인
      </button>
    </CenteredPage>
  );
}
