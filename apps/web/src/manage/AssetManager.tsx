import {
  billingFromDays,
  cardStatements,
  computeCashDate,
  formatWon,
  joinIconName,
  PAYMENT_METHOD_TYPE_LABEL,
  PAYMENT_METHOD_TYPES,
  splitIconName,
  startDayOf,
  todayKst,
  toKstDate,
  type PaymentMethod,
  type PaymentMethodType,
} from '@moayo/core';
import { ArrowLeft, ChevronRight, MinusCircle, MoreVertical, Plus } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { MemberBadge } from '../components/MemberBadge.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { SortableList } from '../components/SortableList.tsx';
import { useToast } from '../components/toastContext.ts';
import { Button } from '../components/ui.tsx';
import { useData } from '../data/dataContext.ts';
import { baseRow, useMutations } from '../data/mutations.ts';
import { assetIcon, LINKABLE_TYPES } from '../lib/assets.ts';
import { useCurrentHousehold } from '../lib/householdContext.ts';

const CARD_TYPES: PaymentMethodType[] = ['credit_card', 'check_card', 'prepaid_card'];
const NOTE: Partial<Record<PaymentMethodType, string>> = {
  check_card: '체크카드는 쓴 날 바로 계좌에서 나갑니다. 결제 계좌를 정해 두면 계좌 내역과 겹치지 않게 맞춥니다.',
  local_currency: '여민전·온통대전처럼 캐시백이 있는 지역화폐는 결제 금액 그대로 기록하고, 잔액 차감 줄은 자동으로 정리합니다.',
  overdraft: '마이너스통장·대출 잔액은 아직 따로 계산하지 않습니다. 이자·상환을 기록하는 자산으로 쓰세요.',
  loan: '마이너스통장·대출 잔액은 아직 따로 계산하지 않습니다. 이자·상환을 기록하는 자산으로 쓰세요.',
};

/** 자산설정 본문: 그룹별 목록. 순서 편집 모드에서는 ⊖ 지우기 · ≡ 끌기. */
export function AssetList({ ordering, onEdit, ownerFilter }: { ordering: boolean; onEdit: (pm: PaymentMethod) => void; ownerFilter: string | 'all' }) {
  const data = useData();
  const { save } = useMutations();
  const toast = useToast();
  const people = data.members.filter((m) => !m.deleted_at);
  const visible = data.paymentMethods.filter(
    (p) => !p.archived && (ownerFilter === 'all' || p.owner_member_id === ownerFilter || !p.owner_member_id),
  );
  const groups = PAYMENT_METHOD_TYPES.map((t) => ({ type: t, items: visible.filter((p) => p.type === t) })).filter((g) => g.items.length);

  const reorder = (ids: string[]) =>
    ids.forEach((id, i) => {
      const p = data.byId.paymentMethod.get(id);
      if (p && p.sort !== i) void save('payment_methods', { ...p, sort: i });
    });
  const archive = (p: PaymentMethod) => {
    if (!window.confirm(`‘${p.name}’을(를) 지울까요?\n이미 기록한 내역은 그대로 남습니다.`)) return;
    void save('payment_methods', { ...p, archived: true });
    toast({ message: `‘${p.name}’을 지웠어요`, action: { label: '되돌리기', onClick: () => void save('payment_methods', { ...p, archived: false }) } });
  };

  const label = (p: PaymentMethod) => {
    const owner = p.owner_member_id ? data.byId.member.get(p.owner_member_id) : null;
    return (
      <span className="flex min-w-0 flex-1 items-center gap-1.5 text-base">
        {people.length > 1 && owner ? <MemberBadge member={owner} size="md" /> : null}
        <span aria-hidden>{assetIcon(p)}</span>
        <span className="truncate">{p.name}</span>
      </span>
    );
  };

  if (groups.length === 0) return <p className="px-5 py-10 text-center text-sm text-muted">자산이 없습니다. 위의 + 로 추가하세요.</p>;
  return (
    <div className="pb-8">
      {groups.map((g) => (
        <section key={g.type}>
          <h3 className="bg-bg px-5 pb-1.5 pt-5 text-sm font-normal text-muted">{PAYMENT_METHOD_TYPE_LABEL[g.type]}</h3>
          {ordering ? (
            <SortableList
              items={g.items}
              onReorder={reorder}
              renderRow={(p, handle) => (
                <div className="flex h-full items-center gap-1 pl-2 pr-1">
                  <button type="button" aria-label={`${p.name} 지우기`} onClick={() => archive(p)} className="press flex size-11 shrink-0 items-center justify-center text-expense">
                    <MinusCircle className="size-6" fill="currentColor" stroke="var(--app-surface)" aria-hidden />
                  </button>
                  {label(p)}
                  {handle}
                </div>
              )}
            />
          ) : (
            <ul className="border-t border-line bg-surface">
              {g.items.map((p) => (
                <li key={p.id} className="border-b border-line">
                  <button type="button" onClick={() => onEdit(p)} className="flex h-13 w-full items-center gap-2 px-5 text-left">
                    {label(p)}
                    <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

/** 위 막대: 두 사람 걸러 보기. */
export function OwnerFilter({ value, onChange }: { value: string | 'all'; onChange: (v: string | 'all') => void }) {
  const data = useData();
  const people = data.members.filter((m) => !m.deleted_at);
  if (people.length < 2) return null;
  return (
    <div className="flex gap-1.5 px-5 pt-3">
      {[{ id: 'all', label: '모두' as ReactNode }, ...people.map((m) => ({ id: m.id, label: <MemberBadge member={m} size="md" /> as ReactNode }))].map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`press h-8 rounded-full px-3 text-sm font-semibold ${value === o.id ? 'bg-fg text-bg' : 'bg-surface-2 text-muted'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 입력 화면 자산판의 연필 → 전체 화면 자산설정. */
export function AssetManagerSheet({ defaultOwnerId, onClose }: { defaultOwnerId: string | null; onClose: () => void }) {
  const [editing, setEditing] = useState<PaymentMethod | 'new' | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [owner, setOwner] = useState<string | 'all'>('all');
  return (
    <>
      <Sheet
        title="자산설정"
        full
        onClose={onClose}
        header={(close) => (
          <div className="flex h-12 items-center gap-1 border-b border-line px-2">
            <button type="button" aria-label="닫기" onClick={close} className="press flex size-11 items-center justify-center rounded-full">
              <ArrowLeft className="size-6" aria-hidden />
            </button>
            <h2 className="min-w-0 flex-1 truncate text-lg font-bold">{ordering ? '순서 바꾸기·지우기' : '자산설정'}</h2>
            {ordering ? (
              <button type="button" onClick={() => setOrdering(false)} className="press h-11 px-3 font-semibold text-brand">
                완료
              </button>
            ) : (
              <>
                <button type="button" aria-label="자산 추가" onClick={() => setEditing('new')} className="press flex size-11 items-center justify-center rounded-full">
                  <Plus className="size-6" aria-hidden />
                </button>
                <button type="button" aria-label="순서 바꾸기·지우기" onClick={() => setOrdering(true)} className="press flex size-11 items-center justify-center rounded-full">
                  <MoreVertical className="size-5" aria-hidden />
                </button>
              </>
            )}
          </div>
        )}
      >
        <OwnerFilter value={owner} onChange={setOwner} />
        <AssetList ordering={ordering} onEdit={setEditing} ownerFilter={owner} />
      </Sheet>
      {editing ? (
        <AssetEditor initial={editing === 'new' ? null : editing} defaultOwnerId={owner !== 'all' ? owner : defaultOwnerId} onClose={() => setEditing(null)} />
      ) : null}
    </>
  );
}

/** 자산추가·수정(편한가계부식): 그룹에 따라 칸이 달라진다. */
export function AssetEditor({
  initial,
  defaultOwnerId,
  onClose,
  onSaved,
}: {
  initial: PaymentMethod | null;
  defaultOwnerId: string | null;
  onClose: () => void;
  onSaved?: (pm: PaymentMethod) => void;
}) {
  const data = useData();
  const household = useCurrentHousehold();
  const { save, remove } = useMutations();
  const people = data.members.filter((m) => !m.deleted_at);
  const [type, setType] = useState<PaymentMethodType | null>(initial?.type ?? null);
  const [picking, setPicking] = useState(!initial);
  const [text, setText] = useState(initial ? joinIconName(initial.icon, initial.name) : '');
  const [ownerId, setOwnerId] = useState<string | null>(initial ? initial.owner_member_id : defaultOwnerId);
  const [linked, setLinked] = useState<string | null>(initial?.linked_account_id ?? null);
  const [last4, setLast4] = useState(initial?.last4 ?? '');
  const [memo, setMemo] = useState(initial?.memo ?? '');
  const [aliases, setAliases] = useState((initial?.aliases ?? []).join(', '));
  const [startDay, setStartDay] = useState(initial?.billing ? startDayOf(initial.billing) : 1);
  const [payDay, setPayDay] = useState(initial?.billing?.payment_day ?? 14);
  const parsed = splitIconName(text);
  const billing = type === 'credit_card' ? billingFromDays(startDay, payDay) : null;
  const accounts = data.paymentMethods.filter((p) => p.type === 'bank_account' && !p.archived && p.id !== initial?.id);
  const usedCount = useMemo(() => (initial ? data.transactions.filter((t) => t.payment_method_id === initial.id).length : 0), [data.transactions, initial]);
  const statements = useMemo(
    () => (billing && initial ? cardStatements(initial.id, billing, data.transactions, todayKst()) : billing ? cardStatements('-', billing, [], todayKst()) : null),
    [billing?.closing_day, billing?.payment_day, initial, data.transactions], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const submit = async (close: () => void) => {
    if (!type || !parsed.name) return;
    const row: PaymentMethod = {
      ...(initial ?? { ...baseRow(household.householdId), sort: data.paymentMethods.length, color: null, issuer: null, archived: false }),
      type,
      name: parsed.name.slice(0, 30),
      icon: parsed.icon,
      owner_member_id: ownerId,
      linked_account_id: LINKABLE_TYPES.includes(type) ? linked : null,
      last4: CARD_TYPES.includes(type) && /^[0-9*]{1,4}$/.test(last4.trim()) ? last4.trim() : null,
      memo: memo.trim() || null,
      aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean).slice(0, 20),
      billing,
    };
    const saved = await save('payment_methods', row);
    onSaved?.(saved);
    close();
    // 결제일 규칙이 바뀌면 이 자산으로 기록한 내역의 '나간 날'도 다시 계산한다(직접 정한 날짜는 그대로).
    if (initial && (initial.type !== saved.type || JSON.stringify(initial.billing) !== JSON.stringify(saved.billing))) {
      for (const tx of data.transactions) {
        if (tx.payment_method_id !== saved.id || tx.cash_date_override || (tx.payments?.length ?? 0) > 1) continue;
        const cashDate = computeCashDate(toKstDate(tx.occurred_at), saved);
        if (cashDate !== tx.cash_date) void save('transactions', { ...tx, cash_date: cashDate });
      }
    }
  };

  const destroy = async (close: () => void) => {
    if (!initial) return;
    if (usedCount > 0) {
      if (!window.confirm(`이 자산으로 기록한 내역이 ${usedCount}건 있어요. 목록에서만 숨길까요? (내역은 그대로)`)) return;
      void save('payment_methods', { ...initial, archived: true });
    } else {
      if (!window.confirm(`${initial.name}을(를) 지울까요?`)) return;
      void remove('payment_methods', initial);
    }
    close();
  };

  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const md = (d: string) => `${d.slice(5, 7)}.${d.slice(8, 10)}`;

  return (
    <>
      <Sheet
        title={initial ? '자산수정' : '자산추가'}
        full
        onClose={onClose}
        header={(close) => (
          <div className="flex h-12 items-center gap-1 border-b border-line px-2">
            <button type="button" aria-label="닫기" onClick={close} className="press flex size-11 items-center justify-center rounded-full">
              <ArrowLeft className="size-6" aria-hidden />
            </button>
            <h2 className="min-w-0 flex-1 truncate text-lg font-bold">{initial ? '자산수정' : '자산추가'}</h2>
          </div>
        )}
        footer={(close) => (
          <div className="flex gap-2">
            <Button block disabled={!type || !parsed.name} onClick={() => void submit(close)}>
              저장하기
            </Button>
            {initial ? (
              <Button variant="secondary" onClick={() => void destroy(close)} className="shrink-0 text-expense">
                지우기
              </Button>
            ) : null}
          </div>
        )}
      >
        <div className="px-5 pb-6 pt-1">
          <Line label="그룹" onClick={() => setPicking(true)}>
            <span className={type ? '' : 'text-muted/50'}>{type ? PAYMENT_METHOD_TYPE_LABEL[type] : '고르세요'}</span>
          </Line>
          {people.length > 1 ? (
            <Line label="주인">
              <div className="flex flex-wrap gap-1.5">
                {[...people.map((m) => ({ id: m.id as string | null, node: <MemberBadge member={m} size="md" /> as ReactNode })), { id: null, node: '같이' as ReactNode }].map((o) => (
                  <button
                    key={o.id ?? 'shared'}
                    type="button"
                    aria-pressed={ownerId === o.id}
                    onClick={() => setOwnerId(o.id)}
                    className={`press h-8 rounded-full px-3 text-sm font-semibold ${ownerId === o.id ? 'bg-fg text-bg' : 'bg-surface-2 text-muted'}`}
                  >
                    {o.node}
                  </button>
                ))}
              </div>
            </Line>
          ) : null}
          <Line label="이름">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={34}
              aria-label="자산 이름"
              placeholder={type ? `${assetIcon({ type })}${type === 'credit_card' ? '현대카드' : PAYMENT_METHOD_TYPE_LABEL[type]}` : '이름'}
              className="w-full bg-transparent text-base outline-none placeholder:text-muted/40"
            />
          </Line>
          {type && LINKABLE_TYPES.includes(type) ? (
            <Line label="결제">
              <select value={linked ?? ''} onChange={(e) => setLinked(e.target.value || null)} aria-label="결제 계좌" className="w-full bg-transparent text-base outline-none">
                <option value="">연결 안 함</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Line>
          ) : null}
          {type && CARD_TYPES.includes(type) ? (
            <Line label="끝 4자리">
              <input value={last4} onChange={(e) => setLast4(e.target.value.replace(/[^0-9*]/g, '').slice(0, 4))} inputMode="numeric" aria-label="카드 끝 4자리" placeholder="문자에 찍히는 끝자리" className="w-full bg-transparent text-base outline-none placeholder:text-muted/40" />
            </Line>
          ) : null}
          <Line label="메모">
            <input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={500} aria-label="메모" className="w-full bg-transparent text-base outline-none" />
          </Line>

          <div className="-mx-5 my-3 h-2 bg-bg" />
          <Line label="문자연결어">
            <input
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              aria-label="문자연결어"
              placeholder="문자·캡처에 찍히는 이름 (쉼표로 구분)"
              className="w-full bg-transparent text-base outline-none placeholder:text-muted/40"
            />
          </Line>

          {type === 'credit_card' && billing && statements ? (
            <>
              <div className="-mx-5 my-3 h-2 bg-bg" />
              <Line label="정산일">
                <select value={startDay} onChange={(e) => setStartDay(Number(e.target.value))} aria-label="정산일" className="w-full bg-transparent text-base outline-none">
                  {days.map((d) => (
                    <option key={d} value={d}>
                      {d} 일
                    </option>
                  ))}
                </select>
              </Line>
              <Line label="결제일">
                <select value={payDay} onChange={(e) => setPayDay(Number(e.target.value))} aria-label="결제일" className="w-full bg-transparent text-base outline-none">
                  {days.map((d) => (
                    <option key={d} value={d}>
                      {d} 일
                    </option>
                  ))}
                </select>
              </Line>
              <div className="mt-4 space-y-2 rounded-xl border border-line p-4 text-sm">
                {statements.map((st, i) => (
                  <div key={st.payDate} className="flex items-baseline gap-3">
                    <span className="w-24 shrink-0 font-normal text-muted">{i === 0 ? (st.payDate >= todayKst() ? '결제예정금액' : '지난 결제') : '미결제금액'}</span>
                    <span className="tabular min-w-0 flex-1 text-right">
                      {md(st.from)} ~ {md(st.to)} (결제: {md(st.payDate)})
                      {initial ? <b className="ml-2">{formatWon(st.amount)}</b> : null}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
          {type && NOTE[type] ? <p className="mt-4 text-sm font-normal leading-relaxed text-muted">{NOTE[type]}</p> : null}
        </div>
      </Sheet>
      {picking ? (
        <Sheet title="자산그룹" onClose={() => (type ? setPicking(false) : onClose())}>
          {(close) => (
            <ul className="-mx-5 divide-y divide-line">
              {PAYMENT_METHOD_TYPES.map((t) => (
                <li key={t}>
                  <button
                    type="button"
                    onClick={() => {
                      setType(t);
                      setPicking(false);
                      close();
                    }}
                    className={`flex h-12 w-full items-center gap-2 px-6 text-left text-base ${t === type ? 'font-bold text-brand' : ''}`}
                  >
                    <span aria-hidden>{assetIcon({ type: t })}</span>
                    {PAYMENT_METHOD_TYPE_LABEL[t]}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      ) : null}
    </>
  );
}

function Line({ label, onClick, children }: { label: string; onClick?: () => void; children: ReactNode }) {
  const inner = (
    <>
      <span className="w-20 shrink-0 text-sm font-normal text-muted">{label}</span>
      <div className="flex min-h-12 min-w-0 flex-1 items-center border-b border-line">{children}</div>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 text-left">
      {inner}
    </button>
  ) : (
    <div className="flex items-center gap-3">{inner}</div>
  );
}
