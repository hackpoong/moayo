import { computeCashDate, PAYMENT_METHOD_TYPE_LABEL, toKstDate, type PaymentMethod, type PaymentMethodType } from '@moayo/core';
import { Link2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Sheet } from '../../components/Sheet.tsx';
import { Button } from '../../components/ui.tsx';
import { useData } from '../../data/dataContext.ts';
import { baseRow, useMutations } from '../../data/mutations.ts';
import { useCurrentHousehold } from '../../lib/householdContext.ts';

/** 표시 이름으로 종류를 짐작한다. */
function guessType(label: string): PaymentMethodType {
  if (/여민전|코나|지역화폐/.test(label)) return 'local_currency';
  if (/온누리|상품권/.test(label)) return 'gift_voucher';
  if (/체크/.test(label)) return 'check_card';
  if (/카드/.test(label)) return 'credit_card';
  if (/페이|머니/.test(label)) return 'easy_pay';
  if (/현금|ATM/i.test(label)) return 'cash';
  return 'bank_account';
}

/** 자동 입력에서 들어온, 아직 결제수단과 연결되지 않은 표시 이름들. */
export function PaymentLabels() {
  const data = useData();
  const labels = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tx of data.transactions) if (!tx.payment_method_id && tx.payment_label) counts.set(tx.payment_label, (counts.get(tx.payment_label) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [data.transactions]);
  const [picking, setPicking] = useState<string | null>(null);

  if (labels.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-medium text-muted">연결이 필요한 결제수단 이름</h2>
      <p className="px-1 text-xs text-muted">캡처·문자에 찍힌 이름입니다. 한 번 연결하면 지금까지의 내역과 앞으로 들어올 내역에 자동으로 적용됩니다.</p>
      <ul className="divide-y divide-line rounded-2xl bg-surface px-4">
        {labels.map(([label, count]) => (
          <li key={label}>
            <button type="button" onClick={() => setPicking(label)} className="flex w-full items-center gap-3 py-3 text-left">
              <Link2 className="size-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <span className="text-sm text-muted">{count}건</span>
              <span className="text-sm font-semibold text-brand">연결</span>
            </button>
          </li>
        ))}
      </ul>
      {picking ? <LinkSheet label={picking} onClose={() => setPicking(null)} /> : null}
    </section>
  );
}

function LinkSheet({ label, onClose }: { label: string; onClose: () => void }) {
  const data = useData();
  const household = useCurrentHousehold();
  const { save } = useMutations();
  const [busy, setBusy] = useState(false);
  const methods = data.paymentMethods.filter((m) => !m.archived);

  const link = async (method: PaymentMethod) => {
    setBusy(true);
    const withAlias = method.aliases.includes(label) ? method : await save('payment_methods', { ...method, aliases: [...method.aliases, label] });
    for (const tx of data.transactions) {
      if (tx.payment_label !== label || tx.payment_method_id) continue;
      const cashDate = tx.cash_date_override ? tx.cash_date : computeCashDate(toKstDate(tx.occurred_at), withAlias);
      await save('transactions', { ...tx, payment_method_id: withAlias.id, cash_date: cashDate });
    }
    onClose();
  };

  const createNew = async () => {
    setBusy(true);
    const method = await save('payment_methods', {
      ...baseRow(household.householdId),
      name: label.replace(/^내\s*/, '').slice(0, 30),
      type: guessType(label),
      issuer: null,
      last4: null,
      owner_member_id: null,
      aliases: [label],
      billing: null,
      color: null,
      sort: data.paymentMethods.length,
      archived: false,
    });
    await link(method);
  };

  return (
    <Sheet title={`‘${label}’ 연결`} onClose={onClose}>
      <div className="space-y-3 pt-1">
        <p className="text-sm text-muted">어느 결제수단인가요?</p>
        <ul className="divide-y divide-line rounded-2xl border border-line px-4">
          {methods.map((m) => (
            <li key={m.id}>
              <button type="button" disabled={busy} onClick={() => void link(m)} className="flex w-full items-center justify-between py-3 text-left">
                <span className="font-medium">{m.name}</span>
                <span className="text-sm text-muted">{PAYMENT_METHOD_TYPE_LABEL[m.type]}</span>
              </button>
            </li>
          ))}
        </ul>
        <Button block variant="secondary" busy={busy} onClick={() => void createNew()}>
          새 결제수단으로 만들기 ({PAYMENT_METHOD_TYPE_LABEL[guessType(label)]})
        </Button>
        <p className="text-xs text-muted">신용카드로 만들었다면 결제수단 화면에서 결제일을 넣어 주세요.</p>
      </div>
    </Sheet>
  );
}
