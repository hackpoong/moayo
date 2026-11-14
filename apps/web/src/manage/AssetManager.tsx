import {
  billingFromDays,
  cardStatements,
  computeCashDate,
  formatWon,
  joinIconName,
  PAYMENT_METHOD_TYPE_LABEL,
  splitIconName,
  startDayOf,
  todayKst,
  toKstDate,
  typicalStartDay,
  luhnValid,
  cardDigits,
  formatCardNumber,
  normalizeExpiry,
  type ScannedCard,
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
import { ASSET_GROUP_ORDER, assetIcon, LINKABLE_TYPES, PICKABLE_ASSET_TYPES } from '../lib/assets.ts';
import { useCurrentHousehold } from '../lib/householdContext.ts';
import { availableKey } from '../lib/vault.ts';
import { seal } from '../lib/vaultCrypto.ts';
import { CardScan, CvcField } from './CardFields.tsx';
import { VaultSheet } from './VaultSheet.tsx';

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
  const groups = ASSET_GROUP_ORDER.map((t) => ({ type: t, items: visible.filter((p) => p.type === t) })).filter((g) => g.items.length);

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
  // 자산 주인은 한 사람(💛/💙). 주인이 없던 예전 자산은 나로 미리 골라 둔다.
  const [ownerId, setOwnerId] = useState<string>((initial?.owner_member_id ?? defaultOwnerId ?? household.memberId) as string);
  const [linked, setLinked] = useState<string | null>(initial?.linked_account_id ?? null);
  // 카드번호는 전체(또는 끝 4자리만) 그대로 보인다. CVC 만 암호화.
  const [cardNumber, setCardNumber] = useState(initial?.card_number ?? initial?.last4 ?? '');
  const [cardExpiry, setCardExpiry] = useState(initial?.card_expiry ?? '');
  const [cvc, setCvc] = useState<string | null>(null);
  const [memo, setMemo] = useState(initial?.memo ?? '');
  const [aliases, setAliases] = useState((initial?.aliases ?? []).join(', '));
  const [startDay, setStartDay] = useState(initial?.billing ? startDayOf(initial.billing) : 1);
  const [payDay, setPayDay] = useState(initial?.billing?.payment_day ?? 14);
  const [color, setColor] = useState<string | null>(initial?.color ?? null);
  const [askVault, setAskVault] = useState<((k: CryptoKey) => void) | null>(null);
  // 카드 사진으로 AI 가 채운 칸(✨ 표시).
  const [aiFilled, setAiFilled] = useState<Set<string>>(new Set());
  const [startTouched, setStartTouched] = useState(!!initial?.billing);
  const toast = useToast();
  const parsed = splitIconName(text);
  const billing = type === 'credit_card' ? billingFromDays(startDay, payDay) : null;
  const accounts = data.paymentMethods.filter((p) => p.type === 'bank_account' && !p.archived && p.id !== initial?.id);
  const usedCount = useMemo(() => (initial ? data.transactions.filter((t) => t.payment_method_id === initial.id).length : 0), [data.transactions, initial]);
  const statements = useMemo(
    () => (billing && initial ? cardStatements(initial.id, billing, data.transactions, todayKst()) : billing ? cardStatements('-', billing, [], todayKst()) : null),
    [billing?.closing_day, billing?.payment_day, initial, data.transactions], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** 카드 사진으로 읽은 칸을 채운다. 확신이 낮으면 이름·그룹은 비워 두고 확인을 부탁한다. */
  const applyScan = (card: ScannedCard) => {
    const filled = new Set<string>();
    const sure = card.confidence !== 'low';
    if (sure && card.type) {
      setType(card.type);
      setPicking(false);
      filled.add('그룹');
    } else if (!type) {
      setType('credit_card');
      setPicking(false);
    }
    const name = card.product_name ?? card.issuer;
    if (sure && name && !parsed.name) {
      setText(joinIconName(card.emoji ?? '💳', name));
      filled.add('이름');
    }
    if (card.color) setColor(card.color);
    if (card.sms_aliases.length) {
      const have = aliases.split(',').map((a) => a.trim()).filter(Boolean);
      setAliases([...new Set([...have, ...card.sms_aliases])].join(', '));
      filled.add('문자연결어');
    }
    if (card.expiry) {
      setCardExpiry(card.expiry);
      filled.add('유효기간');
    }
    if (card.cvc) {
      setCvc(card.cvc);
      filled.add('CVC');
    }
    if (card.number) {
      setCardNumber(card.number);
      filled.add('카드번호');
      const dup = data.paymentMethods.find((p) => p.id !== initial?.id && !p.archived && p.last4 === card.number!.slice(-4));
      if (dup) toast({ message: `끝자리가 같은 '${dup.name}'이(가) 이미 있어요`, tone: 'error' });
    }
    if (card.bank_hint) {
      const bank = card.bank_hint.replace(/은행$/, '');
      const acc = accounts.find((a) => a.name.includes(bank) || a.aliases.some((x) => x.includes(bank)));
      if (acc && !linked) {
        setLinked(acc.id);
        filled.add('결제');
      }
    }
    if (card.benefits && !memo.trim()) {
      setMemo(`주요 혜택(추정)\n${card.benefits}`);
      filled.add('메모');
    }
    setAiFilled(filled);
    toast({
      message: sure ? '카드를 읽었어요. ✨ 표시한 칸을 확인해 주세요' : '카드를 확실히 알아보지 못했어요. 칸을 확인해 주세요',
      tone: sure ? undefined : 'error',
    });
  };

  const digits = cardDigits(cardNumber);
  const fullNumber = digits.length >= 13 && digits.length <= 19 ? digits : null;
  const expiryOk = !cardExpiry || !!normalizeExpiry(cardExpiry);

  const submit = async (close: () => void, key?: CryptoKey) => {
    if (!type || !parsed.name) return;
    if (fullNumber && !luhnValid(fullNumber) && !window.confirm('카드번호 검증이 맞지 않아요. 그대로 저장할까요?')) return;
    // CVC 만 금고로 암호화한다. 이 휴대폰이 금고를 기억하지 않으면 먼저 연다.
    let secret = initial?.secret ?? null;
    if (cvc !== null) {
      if (cvc) {
        const k = key ?? (await availableKey(household.householdId));
        if (!k) {
          setAskVault(() => (k2: CryptoKey) => void submit(close, k2));
          return;
        }
        secret = await seal(k, { cvc });
      } else secret = null;
    }
    const isCard = CARD_TYPES.includes(type);
    const row: PaymentMethod = {
      ...(initial ?? { ...baseRow(household.householdId), sort: data.paymentMethods.length, color: null, issuer: null, archived: false }),
      type,
      name: parsed.name.slice(0, 30),
      icon: parsed.icon,
      owner_member_id: ownerId,
      linked_account_id: LINKABLE_TYPES.includes(type) ? linked : null,
      // 끝 4자리는 문자 연결용(번호 전체가 없으면 입력한 4자리).
      last4: isCard ? (fullNumber ? fullNumber.slice(-4) : /^\d{4}$/.test(digits) ? digits : null) : null,
      card_number: isCard ? fullNumber : null,
      card_expiry: isCard ? normalizeExpiry(cardExpiry) : null,
      memo: memo.trim() || null,
      aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean).slice(0, 20),
      billing,
      color,
      secret: isCard ? secret : null,
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
          {!type || CARD_TYPES.includes(type) ? <CardScan householdId={household.householdId} onRead={applyScan} /> : null}
          <Line label="그룹" ai={aiFilled.has('그룹')} onClick={() => setPicking(true)}>
            <span className={type ? '' : 'text-muted/50'}>{type ? PAYMENT_METHOD_TYPE_LABEL[type] : '고르세요'}</span>
          </Line>
          {people.length > 1 ? (
            <Line label="주인">
              <div className="flex flex-wrap gap-1.5">
                {people.map((m) => ({ id: m.id, node: <MemberBadge member={m} size="md" /> as ReactNode })).map((o) => (
                  <button
                    key={o.id}
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
          <Line label="이름" ai={aiFilled.has('이름')}>
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
            <Line label="결제" ai={aiFilled.has('결제')}>
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
            <>
              <Line label="카드번호" ai={aiFilled.has('카드번호')}>
                <input
                  value={digits.length > 4 ? formatCardNumber(digits) : digits}
                  onChange={(e) => setCardNumber(cardDigits(e.target.value).slice(0, 19))}
                  inputMode="numeric"
                  autoComplete="off"
                  aria-label="카드번호"
                  placeholder="전체 번호 (또는 끝 4자리)"
                  className={`tabular w-full bg-transparent text-base tracking-wide outline-none placeholder:text-muted/40 placeholder:tracking-normal ${fullNumber && !luhnValid(fullNumber) ? 'text-expense' : ''}`}
                />
              </Line>
              <Line label="유효기간" ai={aiFilled.has('유효기간')}>
                <input
                  value={cardExpiry}
                  onChange={(e) => {
                    const d = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setCardExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
                  }}
                  inputMode="numeric"
                  autoComplete="off"
                  aria-label="유효기간"
                  placeholder="MM/YY"
                  className={`tabular w-full bg-transparent text-base outline-none placeholder:text-muted/40 ${expiryOk ? '' : 'text-expense'}`}
                />
              </Line>
              <Line label="CVC" ai={aiFilled.has('CVC')}>
                <CvcField householdId={household.householdId} sealed={initial?.secret} value={cvc} onChange={setCvc} />
              </Line>
            </>
          ) : null}
          <Line label="메모" ai={aiFilled.has('메모')}>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              maxLength={500}
              enterKeyHint="enter"
              rows={Math.min(6, Math.max(1, memo.split('\n').length))}
              aria-label="메모"
              className="w-full resize-none bg-transparent py-3 text-base leading-relaxed outline-none"
            />
          </Line>

          <div className="-mx-5 my-3 h-2 bg-bg" />
          <Line label="문자연결어" ai={aiFilled.has('문자연결어')}>
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
                <select value={startDay} onChange={(e) => (setStartDay(Number(e.target.value)), setStartTouched(true))} aria-label="정산일" className="w-full bg-transparent text-base outline-none">
                  {days.map((d) => (
                    <option key={d} value={d}>
                      {d} 일
                    </option>
                  ))}
                </select>
              </Line>
              <Line label="결제일">
                <select
                  value={payDay}
                  onChange={(e) => {
                    const d = Number(e.target.value);
                    setPayDay(d);
                    // 정산일을 직접 고르지 않았으면 결제일로 흔한 이용기간을 채운다.
                    if (!startTouched) setStartDay(typicalStartDay(d));
                  }} aria-label="결제일" className="w-full bg-transparent text-base outline-none">
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
      {askVault ? (
        <VaultSheet
          householdId={household.householdId}
          reason="카드 정보를 저장하려면 금고를 열어 주세요."
          onKey={(k) => {
            const next = askVault;
            setAskVault(null);
            next(k);
          }}
          onClose={() => setAskVault(null)}
        />
      ) : null}
      {picking ? (
        <Sheet title="자산그룹" onClose={() => (type ? setPicking(false) : onClose())}>
          {(close) => (
            <ul className="-mx-5 divide-y divide-line">
              {(type === 'cash' ? [...PICKABLE_ASSET_TYPES, 'cash' as const] : PICKABLE_ASSET_TYPES).map((t) => (
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

function Line({ label, onClick, children, ai }: { label: string; onClick?: () => void; children: ReactNode; ai?: boolean }) {
  const inner = (
    <>
      <span className="w-20 shrink-0 text-sm font-normal text-muted">
        {label}
        {ai ? (
          <span className="ml-0.5 text-brand" title="카드 사진으로 채움" aria-label="(사진으로 채움)">
            ✨
          </span>
        ) : null}
      </span>
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
