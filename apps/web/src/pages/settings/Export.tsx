import { todayKst, transactionsToCsv } from '@moayo/core';
import { Download } from 'lucide-react';
import { Card } from '../../components/ui.tsx';
import { Button } from '../../components/ui.tsx';
import { useData } from '../../data/dataContext.ts';
import { useCurrentHousehold } from '../../lib/householdContext.ts';
import { SettingsHeader } from './common.tsx';

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportPage() {
  const data = useData();
  const household = useCurrentHousehold();
  const stamp = todayKst();

  const csv = () =>
    download(
      `모아요-${household.householdName}-${stamp}.csv`,
      transactionsToCsv(data.transactions, {
        categories: data.byId.category,
        paymentMethods: data.byId.paymentMethod,
        members: data.byId.member,
        tags: data.byId.tag,
      }),
      'text/csv;charset=utf-8',
    );

  const json = () =>
    download(
      `모아요-백업-${stamp}.json`,
      JSON.stringify(
        {
          format: 'moayo-backup',
          version: 1,
          exported_at: new Date().toISOString(),
          household: { id: household.householdId, name: household.householdName },
          transactions: data.transactions,
          payment_methods: data.paymentMethods,
          categories: data.categories,
          tags: data.tags,
          transfer_rules: data.transferRules,
          members: data.members.map(({ id, display_name, role }) => ({ id, display_name, role })),
        },
        null,
        2,
      ),
      'application/json',
    );

  return (
    <div className="space-y-4">
      <SettingsHeader title="내보내기·백업" />
      <Card>
        <h2 className="font-semibold">엑셀용 CSV</h2>
        <p className="mt-1 text-sm text-muted">내역 {data.transactions.length}건을 엑셀·구글 시트에서 바로 열 수 있는 파일로 받습니다.</p>
        <Button onClick={csv} variant="secondary" className="mt-3" disabled={!data.transactions.length}>
          <Download className="size-5" aria-hidden />
          CSV 받기
        </Button>
      </Card>
      <Card>
        <h2 className="font-semibold">전체 백업 (JSON)</h2>
        <p className="mt-1 text-sm text-muted">
          내역과 결제수단·카테고리·태그·규칙을 통째로 받습니다. 무료 서버는 자동 백업이 없어서, 한 달에 한 번 받아 두시길 권합니다.
        </p>
        <Button onClick={json} variant="secondary" className="mt-3">
          <Download className="size-5" aria-hidden />
          백업 받기
        </Button>
      </Card>
    </div>
  );
}
