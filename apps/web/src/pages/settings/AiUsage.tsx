import { daysInMonth, formatWon, parseDate, shiftMonth, todayKst } from '@moayo/core';
import { EmptyState } from '../../components/bits.tsx';
import { Card, ErrorNote } from '../../components/ui.tsx';
import { monthLabel } from '../../lib/format.ts';
import { SettingsHeader } from './common.tsx';
import { KRW_PER_USD, summarizeUsage, useAiUsage } from './aiUsageData.ts';

const won = (usd: number) => formatWon(Math.round(usd * KRW_PER_USD));
const usd = (v: number) => `$${v < 0.01 && v > 0 ? v.toFixed(4) : v.toFixed(2)}`;

/** AI 사용량·비용. 서버 원문 보관함에 건마다 남긴 토큰 수와 추정 비용을 달별로 모아 보여 준다. */
export function AiUsagePage() {
  const { rows, error } = useAiUsage();
  const today = todayKst();
  const thisMonth = today.slice(0, 7);

  if (!rows) {
    return (
      <div className="space-y-4">
        <SettingsHeader title="AI 사용량·비용" />
        <ErrorNote>{error}</ErrorNote>
        {!error ? <p className="py-6 text-center text-sm text-muted">불러오는 중…</p> : null}
      </div>
    );
  }

  const { months, latestModel } = summarizeUsage(rows);
  const empty = { month: thisMonth, ai: 0, rule: 0, failed: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 };
  const current = months.find((m) => m.month === thisMonth) ?? empty;
  const { y, m, d } = parseDate(today);
  const projected = (current.costUsd / d) * daysInMonth(y, m);
  const perCall = current.ai ? current.costUsd / current.ai : null;
  const shown = months.filter((mo) => mo.month >= shiftMonth(thisMonth, -5));

  return (
    <div className="space-y-4">
      <SettingsHeader title="AI 사용량·비용" />

      <Card>
        <p className="text-sm text-muted">{monthLabel(thisMonth)} AI 사용료 (지금까지)</p>
        <p className="tabular mt-1 text-3xl font-bold">{won(current.costUsd)}</p>
        <p className="tabular mt-1 text-sm text-muted">
          {usd(current.costUsd)} · 이 속도면 이번 달 약 <b className="text-fg">{won(projected)}</b>
        </p>
        <div className="tabular mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label="AI 로 읽음" value={`${current.ai}건`} />
          <Stat label="규칙으로 읽음" value={`${current.rule}건`} hint="무료" />
          <Stat label="건당 평균" value={perCall === null ? '-' : won(perCall)} />
        </div>
        {current.failed ? <p className="mt-3 text-xs text-muted">실패 {current.failed}건(실패한 요청은 보통 비용이 들지 않습니다)</p> : null}
      </Card>

      <Card>
        <h2 className="font-semibold">월별</h2>
        {shown.length === 0 ? (
          <div className="mt-2">
            <EmptyState title="아직 AI 를 쓴 기록이 없습니다">사진·문자로 넣으면 여기에 쌓입니다.</EmptyState>
          </div>
        ) : (
          <table className="tabular mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1.5 font-medium">달</th>
                <th className="py-1.5 text-right font-medium">AI 건수</th>
                <th className="py-1.5 text-right font-medium">토큰(입력/출력)</th>
                <th className="py-1.5 text-right font-medium">비용</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((mo) => (
                <tr key={mo.month} className="border-t border-line">
                  <td className="py-2">{monthLabel(mo.month)}</td>
                  <td className="py-2 text-right">{mo.ai}</td>
                  <td className="py-2 text-right text-muted">
                    {compactTokens(mo.inputTokens)} / {compactTokens(mo.outputTokens)}
                  </td>
                  <td className="py-2 text-right font-semibold">{won(mo.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold">알아 두기</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
          <li>
            지금 쓰는 모델: <b className="text-fg">{latestModel ?? '아직 기록 없음'}</b>
          </li>
          <li>비용은 요청마다 받은 토큰 수에 모델 단가를 곱한 추정치입니다. 실제 청구액은 AI 업체 콘솔에서 확인하세요.</li>
          <li>원화는 1달러 ≈ {KRW_PER_USD.toLocaleString('ko-KR')}원으로 환산했습니다.</li>
          <li>긴 스크롤 캡처(네이버페이 등)는 여러 조각으로 나눠 읽어서 조각 수만큼 건수가 늘어납니다.</li>
          <li>카드·은행 결제 문자는 AI 없이 규칙으로 읽어 비용이 들지 않습니다.</li>
        </ul>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-2 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 font-semibold">{value}</p>
      {hint ? <p className="text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

function compactTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

/** 더보기 메뉴 줄에 붙는 '이번 달 N원'. */
export function AiUsagePreview() {
  const { rows } = useAiUsage();
  if (!rows) return null;
  const month = todayKst().slice(0, 7);
  const current = summarizeUsage(rows).months.find((mo) => mo.month === month);
  return <span className="tabular text-sm text-muted">이번 달 {won(current?.costUsd ?? 0)}</span>;
}

