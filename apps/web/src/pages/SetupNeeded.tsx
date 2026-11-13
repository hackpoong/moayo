import { Card, CenteredPage, Logo } from '../components/ui.tsx';

/** Supabase 환경변수가 없을 때 보여 주는 안내. 배포 설정이 빠졌다는 뜻이다. */
export function SetupNeeded() {
  return (
    <CenteredPage>
      <Logo />
      <div>
        <h1 className="text-2xl font-bold">서버 연결 설정이 필요합니다</h1>
        <p className="mt-2 text-muted">아래 두 값을 넣고 다시 빌드하면 앱이 시작됩니다.</p>
      </div>
      <Card>
        <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed">
          <li>
            <code className="rounded bg-surface-2 px-1.5 py-0.5">apps/web/.env.example</code> 을{' '}
            <code className="rounded bg-surface-2 px-1.5 py-0.5">.env.local</code> 로 복사합니다.
          </li>
          <li>
            Supabase 대시보드의 Project Settings → API 에서 <b>Project URL</b> 과 <b>anon public key</b> 를 복사해
            넣습니다.
          </li>
          <li>배포 환경(Netlify 등)에도 같은 이름의 환경변수를 등록합니다.</li>
        </ol>
      </Card>
    </CenteredPage>
  );
}
