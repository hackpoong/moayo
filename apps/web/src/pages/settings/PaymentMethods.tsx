import {
  computeCashDate,
  PAYMENT_METHOD_TYPE_LABEL,
  PAYMENT_METHOD_TYPES,
  todayKst,
  toKstDate,
  type BillingRule,
  type PaymentMethod,
  type PaymentMethodType,
} from '@moayo/core';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '../../components/bits.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { Button } from '../../components/ui.tsx';
import { useData } from '../../data/dataContext.ts';
import { baseRow, useMutations } from '../../data/mutations.ts';
import { shortDate } from '../../lib/format.ts';
import { useCurrentHousehold } from '../../lib/householdContext.ts';
import { Labeled, MoveButtons, SettingsHeader } from './common.tsx';
import { PaymentLabels } from './PaymentLabels.tsx';
import { inputClass, swapSort } from './util.ts';

export function PaymentMethodsPage() {
  const data = useData();
  const { save } = useMutations();
  const [editing, setEditing] = useState<PaymentMethod | 'new' | null>(null);
  const active = data.paymentMethods.filter((p) => !p.archived);
  const archived = data.paymentMethods.filter((p) => p.archived);

  const move = (i: number, j: number) => {
    const pair = swapSort(active, i, j);
    if (pair) for (const row of pair) void save('payment_methods', row);
  };

  return (
    <div className="space-y-4">
      <SettingsHeader
        title="결제수단"
        action={
          <Button onClick={() => setEditing('new')} className="h-10 px-4 text-sm">
            <Plus className="size-4" aria-hidden />
            추가
          </Button>
        }
      />
      <p className="px-1 text-sm text-muted">
        신용카드는 결제일을 넣어 두면 ‘나간 날’ 기준 달력·통계에 실제 결제일로 잡힙니다. 끝 4자리와 별칭은 나중에 문자·알림으로 자동 입력할 때
        카드를 알아보는 데 씁니다.
      </p>
      <PaymentLabels />
      {active.length === 0 ? <EmptyState title="결제수단이 없습니다" /> : null}
      <ul className="divide-y divide-line rounded-2xl bg-surface px-4">
        {active.map((pm, i) => (
          <li key={pm.id} className="flex items-center gap-2 py-3">
            <button type="button" onClick={() => setEditing(pm)} className="min-w-0 flex-1 text-left">
              <p className="truncate font-medium">{pm.name}</p>
              <p className="truncate text-[13px] text-muted">{describe(pm)}</p>
            </button>
            <MoveButtons label={pm.name} onUp={i > 0 ? () => move(i, i - 1) : undefined} onDown={i < active.length - 1 ? () => move(i, i + 1) : undefined} />
          </li>
        ))}
      </ul>
      {archived.length ? (
        <section>
          <h2 className="mb-2 px-1 text-sm font-medium text-muted">보관함 (입력할 때 안 보임)</h2>
          <ul className="divide-y divide-line rounded-2xl bg-surface px-4">
            {archived.map((pm) => (
              <li key={pm.id}>
                <button type="button" onClick={() => setEditing(pm)} className="w-full py-3 text-left text-muted">
                  {pm.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {editing ? <PaymentMethodForm initial={editing === 'new' ? null : editing} nextSort={data.paymentMethods.length} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function describe(pm: PaymentMethod): string {
  const parts: string[] = [PAYMENT_METHOD_TYPE_LABEL[pm.type]];
  if (pm.issuer) parts.push(pm.issuer);
  if (pm.last4) parts.push(`끝 ${pm.last4}`);
  if (pm.type === 'credit_card' && pm.billing) parts.push(`매달 ${pm.billing.payment_day}일 결제`);
  return parts.join(' · ');
}

/** 마감일이 결제일보다 늦거나 같으면 다음 달 결제가 보통이다. */
function guessOffset(closing: number, payment: number): number {
  return closing >= payment ? 1 : 0;
}

function PaymentMethodForm({ initial, nextSort, onClose }: { initial: PaymentMethod | null; nextSort: number; onClose: () => void }) {
  const household = useCurrentHousehold();
  const data = useData();
  const { save, remove } = useMutations();
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<PaymentMethodType>(initial?.type ?? 'credit_card');
  const [issuer, setIssuer] = useState(initial?.issuer ?? '');
  const [last4, setLast4] = useState(initial?.last4 ?? '');
  const [aliases, setAliases] = useState((initial?.aliases ?? []).join(', '));
  const [ownerId, setOwnerId] = useState<string | null>(initial?.owner_member_id ?? null);
  const [paymentDay, setPaymentDay] = useState(initial?.billing?.payment_day ?? 14);
  const [closingDay, setClosingDay] = useState(initial?.billing?.closing_day ?? 31);
  const [offset, setOffset] = useState(initial?.billing?.payment_month_offset ?? 1);
  const [offsetTouched, setOffsetTouched] = useState(!!initial?.billing);
  const [archived, setArchived] = useState(initial?.archived ?? false);

  const billing: BillingRule | null = type === 'credit_card' ? { closing_day: closingDay, payment_day: paymentDay, payment_month_offset: offset } : null;
  const today = todayKst();
  const example = billing ? computeCashDate(today, { type, billing }) : null;
  const usedCount = initial ? data.transactions.filter((t) => t.payment_method_id === initial.id).length : 0;

  const changeDays = (closing: number, payment: number) => {
    setClosingDay(closing);
    setPaymentDay(payment);
    if (!offsetTouched) setOffset(guessOffset(closing, payment));
  };

  const submit = async () => {
    const saved = await save('payment_methods', {
      ...(initial ?? { ...baseRow(household.householdId), sort: nextSort, color: null }),
      name: name.trim(),
      type,
      issuer: issuer.trim() || null,
      last4: last4.trim() || null,
      aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean),
      owner_member_id: ownerId,
      billing,
      archived,
    });
    // 결제일 규칙이 바뀌면 이 수단으로 기록한 내역의 '나간 날'도 다시 계산한다(직접 정한 날짜는 그대로).
    if (initial && (initial.type !== saved.type || JSON.stringify(initial.billing) !== JSON.stringify(saved.billing))) {
      for (const tx of data.transactions) {
        if (tx.payment_method_id !== saved.id || tx.cash_date_override) continue;
        const cashDate = computeCashDate(toKstDate(tx.occurred_at), saved);
        if (cashDate !== tx.cash_date) await save('transactions', { ...tx, cash_date: cashDate });
      }
    }
    onClose();
  };

  const destroy = async () => {
    if (!initial) return;
    if (usedCount > 0) {
      window.alert(`이 결제수단으로 기록한 내역이 ${usedCount}건 있어 지울 수 없습니다. 대신 ‘보관’하면 입력할 때 보이지 않습니다.`);
      return;
    }
    if (!window.confirm(`${initial.name}을(를) 지울까요?`)) return;
    await remove('payment_methods', initial);
    onClose();
  };

  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  return (
    <Sheet
      title={initial ? '결제수단 고치기' : '결제수단 추가'}
      onClose={onClose}
      tall
      footer={
        <div className="flex gap-2">
          {initial ? (
            <Button variant="danger" onClick={() => void destroy()}>
              지우기
            </Button>
          ) : null}
          <Button block disabled={!name.trim() || (!!last4 && !/^\d{1,4}$/.test(last4))} onClick={() => void submit()}>
            저장
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <Labeled label="종류">
          <select value={type} onChange={(e) => setType(e.target.value as PaymentMethodType)} className={inputClass}>
            {PAYMENT_METHOD_TYPES.map((t) => (
              <option key={t} value={t}>
                {PAYMENT_METHOD_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="이름">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="예: 현대카드 M, 농협 BC" className={inputClass} />
        </Labeled>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="카드사·은행">
            <input value={issuer} onChange={(e) => setIssuer(e.target.value)} maxLength={20} placeholder="예: 현대" className={inputClass} />
          </Labeled>
          <Labeled label="번호 끝 4자리">
            <input value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="1234" className={inputClass} />
          </Labeled>
        </div>

        {type === 'credit_card' ? (
          <div className="space-y-3 rounded-2xl bg-surface-2 p-4">
            <p className="font-medium">결제일</p>
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="매달 결제일">
                <select value={paymentDay} onChange={(e) => changeDays(closingDay, Number(e.target.value))} className={inputClass}>
                  {days.map((d) => (
                    <option key={d} value={d}>
                      {d}일
                    </option>
                  ))}
                </select>
              </Labeled>
              <Labeled label="이용기간 마감일">
                <select value={closingDay} onChange={(e) => changeDays(Number(e.target.value), paymentDay)} className={inputClass}>
                  {days.map((d) => (
                    <option key={d} value={d}>
                      {d === 31 ? '말일' : `${d}일`}
                    </option>
                  ))}
                </select>
              </Labeled>
            </div>
            <Labeled label="마감된 사용분이 결제되는 달">
              <select
                value={offset}
                onChange={(e) => {
                  setOffset(Number(e.target.value));
                  setOffsetTouched(true);
                }}
                className={inputClass}
              >
                <option value={0}>마감한 그달</option>
                <option value={1}>다음 달</option>
                <option value={2}>다다음 달</option>
              </select>
            </Labeled>
            {example ? (
              <p className="text-sm">
                오늘({shortDate(today)}) 쓰면 <b>{shortDate(example)}</b>에 결제됩니다.
                <span className="mt-1 block text-xs text-muted">카드사 앱의 ‘이용기간’과 맞는지 한 번 확인해 주세요.</span>
              </p>
            ) : null}
          </div>
        ) : null}

        <Labeled label="별칭 (쉼표로 구분)" hint="문자·알림에 찍히는 카드 이름. 예: 비씨, 농협BC, NH">
          <input value={aliases} onChange={(e) => setAliases(e.target.value)} className={inputClass} />
        </Labeled>

        {data.members.filter((m) => !m.deleted_at).length > 0 ? (
          <Labeled label="주인 (쓴 사람으로 기록됨)">
            <select value={ownerId ?? ''} onChange={(e) => setOwnerId(e.target.value || null)} className={inputClass}>
              <option value="">같이 씀 (고를 때 보고 있던 사람)</option>
              {data.members
                .filter((m) => !m.deleted_at)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name}
                  </option>
                ))}
            </select>
          </Labeled>
        ) : null}

        {initial ? (
          <label className="flex items-center gap-3 py-1">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="size-5 accent-[var(--app-brand)]" />
            <span>보관 (해지한 카드 등. 예전 내역은 그대로 남습니다)</span>
          </label>
        ) : null}
      </div>
    </Sheet>
  );
}
