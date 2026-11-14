import { PAYMENT_METHOD_TYPE_LABEL, PAYMENT_METHOD_TYPES, type PaymentMethod, type PaymentMethodType } from '@moayo/core';
import { useState } from 'react';
import { Button } from '../components/ui.tsx';
import { useData } from '../data/dataContext.ts';
import { baseRow, useMutations } from '../data/mutations.ts';
import { useCurrentHousehold } from '../lib/householdContext.ts';
import { guessPaymentType } from '../lib/paymentType.ts';

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

/** 입력 화면 안에서 바로 결제수단을 추가한다. 신용카드는 결제일만 물어본다(이용기간은 전월 1일~말일로). */
export function NewPaymentMethod({ onCreated, onCancel }: { onCreated: (pm: PaymentMethod) => void; onCancel: () => void }) {
  const household = useCurrentHousehold();
  const data = useData();
  const { save } = useMutations();
  const [name, setName] = useState('');
  const [type, setType] = useState<PaymentMethodType>('credit_card');
  const [typeTouched, setTypeTouched] = useState(false);
  const [paymentDay, setPaymentDay] = useState(14);
  const [busy, setBusy] = useState(false);

  const changeName = (value: string) => {
    setName(value);
    if (!typeTouched && value.trim()) setType(guessPaymentType(value));
  };

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const pm = await save('payment_methods', {
      ...baseRow(household.householdId),
      name: name.trim().slice(0, 30),
      type,
      issuer: null,
      last4: null,
      owner_member_id: null,
      aliases: [],
      billing: type === 'credit_card' ? { closing_day: 31, payment_day: paymentDay, payment_month_offset: 1 } : null,
      color: null,
      sort: data.paymentMethods.length,
      archived: false,
    });
    onCreated(pm);
  };

  return (
    <div className="mt-3 space-y-3 rounded-2xl bg-surface-2 p-3">
      <input
        value={name}
        onChange={(e) => changeName(e.target.value)}
        placeholder="이름 (예: 현대카드 M, 국민 체크카드)"
        aria-label="새 결제수단 이름"
        maxLength={30}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void create();
          }
        }}
        className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-[15px]"
      />
      <div className="flex gap-2">
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value as PaymentMethodType);
            setTypeTouched(true);
          }}
          aria-label="종류"
          className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-[15px]"
        >
          {PAYMENT_METHOD_TYPES.map((t) => (
            <option key={t} value={t}>
              {PAYMENT_METHOD_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        {type === 'credit_card' ? (
          <select value={paymentDay} onChange={(e) => setPaymentDay(Number(e.target.value))} aria-label="결제일" className="h-11 rounded-xl border border-line bg-surface px-3 text-[15px]">
            {DAYS.map((d) => (
              <option key={d} value={d}>
                매달 {d}일 결제
              </option>
            ))}
          </select>
        ) : null}
      </div>
      {type === 'credit_card' ? <p className="text-xs text-muted">전월 1일~말일 사용분이 이달에 결제되는 것으로 둡니다. 다르면 더보기 → 결제수단에서 고치세요.</p> : null}
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel} className="h-10 shrink-0 whitespace-nowrap text-sm">
          취소
        </Button>
        <Button block busy={busy} disabled={!name.trim()} onClick={() => void create()} className="h-10 text-sm">
          추가하고 선택
        </Button>
      </div>
    </div>
  );
}
