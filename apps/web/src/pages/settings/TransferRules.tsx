import type { TransferMatchType, TransferRule } from '@moayo/core';
import { useState, type FormEvent } from 'react';
import { EmptyState } from '../../components/bits.tsx';
import { Button } from '../../components/ui.tsx';
import { useData } from '../../data/dataContext.ts';
import { baseRow, useMutations } from '../../data/mutations.ts';
import { useCurrentHousehold } from '../../lib/householdContext.ts';
import { Labeled, SettingsHeader } from './common.tsx';
import { inputClass } from './util.ts';

const TYPE_LABEL: Record<TransferMatchType, string> = { name: '받는 사람 이름', account: '계좌번호', keyword: '낱말 포함' };

export function TransferRulesPage() {
  const data = useData();
  const household = useCurrentHousehold();
  const { save, remove } = useMutations();
  const [label, setLabel] = useState('');
  const [matchType, setMatchType] = useState<TransferMatchType>('name');
  const [pattern, setPattern] = useState('');

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!pattern.trim()) return;
    await save('transfer_rules', {
      ...baseRow(household.householdId),
      label: label.trim() || pattern.trim(),
      match_type: matchType,
      pattern: pattern.trim(),
      enabled: true,
    });
    setLabel('');
    setPattern('');
  };

  const addPreset = (l: string, p: string) =>
    save('transfer_rules', { ...baseRow(household.householdId), label: l, match_type: 'keyword', pattern: p, enabled: true });

  const toggle = (rule: TransferRule) => save('transfer_rules', { ...rule, enabled: !rule.enabled });

  return (
    <div className="space-y-4">
      <SettingsHeader title="이체로 볼 대상" />
      <p className="px-1 text-sm leading-relaxed text-muted">
        가족끼리 보낸 돈, 내 다른 계좌로 옮긴 돈, 카드대금, 페이·지역화폐 충전은 실제로 쓴 돈이 아니라서 지출로 세면 두 번 잡힙니다. 여기 넣어 두면
        입력할 때 ‘이체’로 바꾸라고 알려 주고, 나중에 문자·알림 자동 입력에서는 바로 이체로 분류합니다.
        <br />
        부모님 용돈처럼 가계 밖으로 나가는 돈은 지출로 두는 것이 보통입니다.
      </p>

      <form onSubmit={add} className="space-y-3 rounded-2xl bg-surface p-4">
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="찾는 방법">
            <select value={matchType} onChange={(e) => setMatchType(e.target.value as TransferMatchType)} className={inputClass}>
              {(Object.keys(TYPE_LABEL) as TransferMatchType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label="이름 (구분용, 선택)">
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="예: 아내" maxLength={40} className={inputClass} />
          </Labeled>
        </div>
        <Labeled label={TYPE_LABEL[matchType]}>
          <input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            maxLength={60}
            inputMode={matchType === 'account' ? 'numeric' : undefined}
            placeholder={matchType === 'name' ? '예: 김영희' : matchType === 'account' ? '예: 110-123-456789' : '예: 카드대금'}
            className={inputClass}
          />
        </Labeled>
        <Button type="submit" block disabled={!pattern.trim()}>
          추가
        </Button>
      </form>

      {data.transferRules.length === 0 ? (
        <EmptyState title="아직 규칙이 없습니다">
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {[
              ['카드대금 출금', '카드대금'],
              ['페이 충전', '충전'],
              ['지역화폐 충전', '여민전'],
            ].map(([l, p]) => (
              <button key={l} type="button" onClick={() => void addPreset(l!, p!)} className="h-9 rounded-full bg-surface-2 px-3.5 text-sm text-fg">
                + {l}
              </button>
            ))}
          </div>
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-2xl bg-surface px-4">
          {data.transferRules.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-3">
              <input type="checkbox" checked={r.enabled} onChange={() => void toggle(r)} aria-label={`${r.label} 사용`} className="size-5 accent-[var(--app-brand)]" />
              <span className="min-w-0 flex-1">
                <span className={`block truncate font-medium ${r.enabled ? '' : 'text-muted line-through'}`}>{r.label}</span>
                <span className="block truncate text-[13px] text-muted">
                  {TYPE_LABEL[r.match_type]}: {r.pattern}
                </span>
              </span>
              <button type="button" onClick={() => void remove('transfer_rules', r)} className="px-2 text-sm text-expense">
                지우기
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
