import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, Card, CenteredPage, ErrorNote, Field, Splash } from '../components/ui.tsx';
import { defaultDisplayName, useSession } from '../lib/authContext.ts';
import { useHouseholds } from '../lib/householdContext.ts';
import { db, describeError } from '../lib/supabase.ts';

type Preview = { status: 'loading' } | { status: 'invalid' } | { status: 'valid'; householdName: string; memberName: string | null };

/** 초대 링크(/join/코드)로 들어온 화면. 어느 가족인지 보여 주고 합류한다. */
export function Join() {
  const { code = '' } = useParams();
  const session = useSession();
  const { refresh, select } = useHouseholds();
  const navigate = useNavigate();

  const [loaded, setLoaded] = useState<{ code: string; preview: Preview } | null>(null);
  const preview: Preview = loaded?.code === code ? loaded.preview : { status: 'loading' };
  const [displayName, setDisplayName] = useState(() => defaultDisplayName(session));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void db()
      .rpc('preview_invite', { p_code: code })
      .then(({ data, error: rpcError }) => {
        if (!active) return;
        const row = (data as { household_name: string; valid: boolean; member_name: string | null }[] | null)?.[0];
        if (rpcError) setError(describeError(rpcError));
        setLoaded({
          code,
          preview: row?.valid ? { status: 'valid', householdName: row.household_name, memberName: row.member_name ?? null } : { status: 'invalid' },
        });
      });
    return () => {
      active = false;
    };
  }, [code]);

  const accept = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await db().rpc('accept_invite', {
      p_code: code,
      p_display_name: displayName.trim() || '나',
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

  if (preview.status === 'loading') return <Splash />;

  if (preview.status === 'invalid') {
    return (
      <CenteredPage>
        <div>
          <h1 className="text-2xl font-bold">쓸 수 없는 초대입니다</h1>
          <p className="mt-2 text-muted">
            초대 코드가 틀렸거나, 이미 사용했거나, 72시간이 지나 만료되었습니다. 가족에게 새 초대 링크를 부탁해 주세요.
          </p>
        </div>
        <ErrorNote>{error}</ErrorNote>
        <Link to="/" className="self-start text-brand underline">
          처음으로
        </Link>
      </CenteredPage>
    );
  }

  return (
    <CenteredPage>
      <div>
        <p className="text-muted">초대를 받았습니다</p>
        <h1 className="mt-1 text-2xl font-bold">‘{preview.householdName}’ 가계부에 합류할까요?</h1>
        {preview.memberName ? <p className="mt-2 text-muted">{preview.memberName}님 자리로 들어갑니다. 미리 넣어 둔 자산·내역이 그대로 이어집니다.</p> : null}
      </div>
      <Card>
        <form onSubmit={accept} className="space-y-4">
          {preview.memberName ? null : (
          <Field
            label="내 이름"
            hint="가족에게 보이는 이름입니다. 예: 엄마, 아빠, 지우"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={20}
            required
          />
          )}
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" block busy={busy} disabled={!preview.memberName && !displayName.trim()}>
            합류하기
          </Button>
        </form>
      </Card>
    </CenteredPage>
  );
}
