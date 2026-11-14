import type { RecurringRule } from '@moayo/core';
import { Sheet } from '../components/Sheet.tsx';
import { Button } from '../components/ui.tsx';

const INSTALLMENTS = [1, 2, 3, 4, 5, 6, 10, 12, 24];

/** 날짜 줄 오른쪽 '반복/할부': 매달 반복과 할부 개월. */
export function RepeatSheet({
  day,
  repeat,
  onRepeat,
  canRepeat,
  sourceRule,
  onStopRule,
  installments,
  onInstallments,
  installmentState,
  onClose,
}: {
  day: number;
  repeat: { on: boolean; times: number | null };
  onRepeat: (r: { on: boolean; times: number | null }) => void;
  canRepeat: boolean;
  sourceRule?: RecurringRule;
  onStopRule: () => void;
  installments: number;
  onInstallments: (n: number) => void;
  installmentState: 'ok' | 'not-credit' | 'multi';
  onClose: () => void;
}) {
  const chip = (on: boolean) => `press h-9 rounded-full px-3.5 text-sm font-semibold ${on ? 'bg-fg text-bg' : 'bg-surface-2 text-muted'}`;
  return (
    <Sheet
      title="반복/할부"
      onClose={onClose}
      footer={(close) => (
        <Button block onClick={close}>
          확인
        </Button>
      )}
    >
      <div className="space-y-6 pb-2 pt-1">
        <section>
          <h3 className="mb-2 text-sm font-normal text-muted">반복</h3>
          {sourceRule ? (
            <div className="rounded-xl bg-surface-2 p-3 text-[15px]">
              <p>
                정기 지출로 매달 {sourceRule.day_of_month}일에 만들어진 내역이에요{sourceRule.paused ? ' (멈춤)' : ''}.
              </p>
              {!sourceRule.paused ? (
                <button type="button" onClick={onStopRule} className="mt-2 text-sm font-semibold text-expense">
                  이 정기 지출 멈추기
                </button>
              ) : null}
            </div>
          ) : canRepeat ? (
            <>
              <div className="flex flex-wrap gap-2">
                <button type="button" aria-pressed={!repeat.on} onClick={() => onRepeat({ on: false, times: null })} className={chip(!repeat.on)}>
                  안 함
                </button>
                <button type="button" aria-pressed={repeat.on} onClick={() => onRepeat({ on: true, times: repeat.times })} className={chip(repeat.on)}>
                  매달 {day}일
                </button>
              </div>
              {repeat.on ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-normal text-muted">끝</span>
                  <button type="button" aria-pressed={repeat.times === null} onClick={() => onRepeat({ on: true, times: null })} className={chip(repeat.times === null)}>
                    계속
                  </button>
                  <label className={`${chip(repeat.times !== null)} flex items-center gap-1`}>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={2}
                      max={600}
                      value={repeat.times ?? ''}
                      placeholder="12"
                      onChange={(e) => onRepeat({ on: true, times: e.target.value ? Math.max(1, Math.min(600, Number(e.target.value))) : null })}
                      aria-label="반복 횟수"
                      className="w-12 bg-transparent text-center outline-none placeholder:text-muted/50"
                    />
                    회
                  </label>
                </div>
              ) : null}
              <p className="mt-2 text-xs font-normal text-muted">켜면 다음 달부터 매달 {day}일에 같은 내용으로 자동 기록됩니다(없는 날은 말일). 더보기 → 정기 지출에서 멈출 수 있어요.</p>
            </>
          ) : (
            <p className="text-sm font-normal text-muted">반복은 새로 입력할 때 정할 수 있어요.</p>
          )}
        </section>
        <section>
          <h3 className="mb-2 text-sm font-normal text-muted">할부</h3>
          {installmentState === 'ok' ? (
            <div className="flex flex-wrap gap-2">
              {INSTALLMENTS.map((n) => (
                <button key={n} type="button" aria-pressed={installments === n} onClick={() => onInstallments(n)} className={chip(installments === n)}>
                  {n === 1 ? '일시불' : `${n}개월`}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm font-normal text-muted">{installmentState === 'multi' ? '자산을 여러 개 고르면 할부를 쓸 수 없어요.' : '신용카드를 고르면 할부를 정할 수 있어요.'}</p>
          )}
        </section>
      </div>
    </Sheet>
  );
}
