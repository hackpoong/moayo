import { Card } from '../components/ui.tsx';
import { useCurrentHousehold } from '../lib/householdContext.ts';

export function Home() {
  const household = useCurrentHousehold();
  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm text-muted">{household.householdName}</p>
        <h1 className="text-2xl font-bold">{household.displayName}님, 안녕하세요</h1>
      </header>
      <Card>
        <h2 className="font-semibold">가계부 준비가 끝났습니다</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          로그인과 가족 만들기·초대까지 동작합니다. 내역 입력, 달력, 통계는 다음 단계에서 이 화면에 채워집니다.
        </p>
      </Card>
      <Card>
        <h2 className="font-semibold">가족을 초대해 보세요</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          더보기 → 가족 초대에서 링크를 만들어 카카오톡으로 보내면, 받은 사람이 눌러서 바로 합류할 수 있습니다.
        </p>
      </Card>
    </div>
  );
}
