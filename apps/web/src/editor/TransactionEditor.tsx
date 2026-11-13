import {
  computeCashDate,
  formatAmount,
  formatWon,
  fromKst,
  matchTransferRule,
  splitsAreValid,
  toKstDate,
  toKstTime,
  todayKst,
  type Category,
  type PaymentMethod,
  type Split,
  type Transaction,
  type TransactionKind,
} from '@moayo/core';
import { ArrowLeftRight, CalendarClock, ChevronRight, Scissors, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CategoryIcon, Chip, Segmented } from '../components/bits.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { Button } from '../components/ui.tsx';
import { useData } from '../data/dataContext.ts';
import { baseRow, newId, useMutations } from '../data/mutations.ts';
import { KIND_LABEL, shortDate } from '../lib/format.ts';
import { useCurrentHousehold } from '../lib/householdContext.ts';
import { ImportButtons } from './ImportSheet.tsx';
import { useOpenEditor, type EditorRequest } from './editorContext.ts';
import { Keypad, QuickAdd } from './Keypad.tsx';
import { SplitEditor } from './SplitEditor.tsx';

type Step = 'amount' | 'category' | 'details';

const INSTALLMENTS = [1, 2, 3, 4, 5, 6, 10, 12, 24];

/** 내역 입력·수정. 새 내역은 금액 → 카테고리 → 저장, 세 번이면 끝난다. */
export function TransactionEditor({ request, onClose }: { request: EditorRequest; onClose: () => void }) {
  const original = request.tx;
  const data = useData();
  const me = useCurrentHousehold();
  const { save, remove } = useMutations();
  const openEditor = useOpenEditor();

  const recentPaymentMethods = useRecentPaymentMethods(me.memberId, original?.payment_method_id ?? null);

  const [step, setStep] = useState<Step>(original ? 'details' : 'amount');
  const [kind, setKind] = useState<TransactionKind>(original?.kind ?? 'expense');
  const [amountText, setAmountText] = useState(original ? String(original.amount) : '');
  const [splits, setSplits] = useState<Split[]>(original?.splits ?? []);
  const [splitMode, setSplitMode] = useState((original?.splits.length ?? 0) > 1);
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(
    original ? original.payment_method_id : (recentPaymentMethods[0]?.id ?? null),
  );
  const [date, setDate] = useState(original ? toKstDate(original.occurred_at) : (request.date ?? todayKst()));
  const [time, setTime] = useState(original ? (original.has_time ? toKstTime(original.occurred_at) : '') : toKstTime(new Date()));
  const [merchant, setMerchant] = useState(original?.merchant ?? '');
  const [memo, setMemo] = useState(original?.memo ?? '');
  const [memberId, setMemberId] = useState<string | null>(original ? original.member_id : me.memberId);
  const [installments, setInstallments] = useState(original?.installment_months ?? 1);
  const [tagIds, setTagIds] = useState<string[]>(original?.tag_ids ?? []);
  const [newTag, setNewTag] = useState('');
  const [busy, setBusy] = useState(false);

  const amount = Number(amountText) || 0;
  const categories = data.categories.filter((c) => c.kind === (kind === 'income' ? 'income' : 'expense') && !c.archived);
  const singleCategoryId = splits.length === 1 ? splits[0]!.category_id : null;
  const paymentMethod = paymentMethodId ? data.byId.paymentMethod.get(paymentMethodId) : undefined;
  const isCredit = paymentMethod?.type === 'credit_card';
  const cashDate = original?.cash_date_override ? original.cash_date : computeCashDate(date, paymentMethod);
  const transferHint = kind !== 'transfer' ? matchTransferRule([merchant, memo], data.transferRules) : null;
  const activeMembers = data.members.filter((m) => !m.deleted_at || m.id === memberId);

  const merchantSuggestions = useMemo(() => {
    const seen = new Set<string>();
    for (const tx of data.transactions.slice(0, 300)) if (tx.merchant) seen.add(tx.merchant);
    return [...seen].slice(0, 50);
  }, [data.transactions]);

  const finalSplits: Split[] =
    kind === 'transfer' ? [] : splitMode ? splits.filter((s) => s.amount > 0) : singleCategoryId ? [{ category_id: singleCategoryId, amount }] : [];
  const valid = amount > 0 && splitsAreValid(amount, finalSplits) && /^\d{4}-\d{2}-\d{2}$/.test(date);

  const changeKind = (next: TransactionKind) => {
    if (next === kind) return;
    setKind(next);
    // 수입·지출 카테고리는 서로 다르므로 고른 것을 비운다.
    setSplits([]);
    setSplitMode(false);
  };

  const pickCategory = (category: Category | null) => {
    setSplits(category ? [{ category_id: category.id, amount }] : []);
    setSplitMode(false);
    setStep('details');
  };

  const startSplit = () => {
    setSplits(splits.length ? splits.map((s, i) => (i === 0 ? { ...s, amount } : s)) : [{ category_id: null, amount }]);
    setSplitMode(true);
    setStep('details');
  };

  const addTag = async () => {
    const name = newTag.trim().replace(/^#/, '');
    if (!name) return;
    const existing = data.tags.find((t) => t.name === name);
    const tag = existing ?? (await save('tags', { ...baseRow(me.householdId), name }));
    setTagIds((ids) => (ids.includes(tag.id) ? ids : [...ids, tag.id]));
    setNewTag('');
  };

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    const now = new Date().toISOString();
    const row: Transaction = {
      ...(original ?? {
        id: newId(),
        household_id: me.householdId,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        status: 'confirmed',
        cash_date_override: false,
        approval_no: null,
        card_last4: null,
        items: null,
        source: 'manual',
        field_sources: {},
        linked_tx_id: null,
        created_by: null,
        payment_label: null,
        review: null,
      }),
      kind,
      amount,
      occurred_at: fromKst(date, time || '12:00'),
      has_time: !!time,
      cash_date: cashDate,
      merchant: merchant.trim() || null,
      memo: memo.trim() || null,
      payment_method_id: paymentMethodId,
      member_id: memberId,
      installment_months: isCredit ? installments : 1,
      splits: finalSplits,
      tag_ids: tagIds,
      // 사용자가 확인하고 저장했으면 '확인 필요'는 풀린다.
      status: original?.status === 'review' ? 'confirmed' : (original?.status ?? 'confirmed'),
      review: null,
      // 자동으로 들어온 내역을 고치면, 이후 자동 입력이 이 값을 덮지 않게 표시한다.
      field_sources: original && original.source !== 'manual' ? { ...original.field_sources, user_edited: 'true' } : (original?.field_sources ?? {}),
    };
    await save('transactions', row);
    onClose();
  };

  const resolveDuplicate = async (same: boolean) => {
    if (!original) return;
    if (same) {
      await remove('transactions', original);
    } else {
      await save('transactions', { ...original, status: 'confirmed', review: null });
    }
    onClose();
  };

  const destroy = async () => {
    if (!original || !window.confirm('이 내역을 지울까요?')) return;
    await remove('transactions', original);
    onClose();
  };

  const title = original ? '내역 고치기' : step === 'category' ? `${formatWon(amount)} · 카테고리` : '내역 추가';

  // ── 1단계: 금액 ─────────────────────────────────────────────────────────
  if (step === 'amount') {
    return (
      <Sheet
        title={title}
        onClose={onClose}
        footer={
          <Button block disabled={amount <= 0} onClick={() => setStep(kind === 'transfer' || original ? 'details' : 'category')}>
            다음
          </Button>
        }
      >
        <div className="space-y-4">
          {!original ? <ImportButtons onPick={(mode) => openEditor({ importMode: mode })} /> : null}
          <KindPicker kind={kind} onChange={changeKind} />
          <p className={`tabular py-3 text-center text-4xl font-bold ${amount ? '' : 'text-muted/50'}`} aria-live="polite">
            {formatAmount(amount)}
            <span className="ml-1 text-2xl">원</span>
          </p>
          <QuickAdd value={amountText} onChange={setAmountText} />
          <Keypad value={amountText} onChange={setAmountText} />
        </div>
      </Sheet>
    );
  }

  // ── 2단계: 카테고리 ─────────────────────────────────────────────────────
  if (step === 'category') {
    return (
      <Sheet title={title} onClose={onClose} tall>
        <div className="grid grid-cols-4 gap-x-2 gap-y-4 pt-2">
          {categories.map((c) => (
            <button key={c.id} type="button" onClick={() => pickCategory(c)} className="flex flex-col items-center gap-1.5 rounded-xl py-1 active:bg-surface-2">
              <CategoryIcon category={c} size="lg" />
              <span className="line-clamp-1 text-[13px]">{c.name}</span>
            </button>
          ))}
          <button type="button" onClick={() => pickCategory(null)} className="flex flex-col items-center gap-1.5 rounded-xl py-1 active:bg-surface-2">
            <CategoryIcon category={null} size="lg" />
            <span className="text-[13px] text-muted">미분류</span>
          </button>
        </div>
        <button type="button" onClick={startSplit} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line text-[15px] font-medium text-muted">
          <Scissors className="size-4" aria-hidden />
          여러 카테고리로 나눠서 기록
        </button>
      </Sheet>
    );
  }

  // ── 3단계: 자세히 ────────────────────────────────────────────────────────
  const singleCategory = singleCategoryId ? data.byId.category.get(singleCategoryId) : null;
  return (
    <Sheet
      title={title}
      onClose={onClose}
      tall
      headerExtra={
        original ? (
          <button type="button" aria-label="지우기" onClick={() => void destroy()} className="rounded-full p-2 text-muted hover:bg-surface-2">
            <Trash2 className="size-5" aria-hidden />
          </button>
        ) : null
      }
      footer={
        <Button block busy={busy} disabled={!valid} onClick={() => void submit()}>
          {original ? '저장' : `${formatWon(amount)} 저장`}
        </Button>
      }
    >
      <div className="space-y-5 pt-1">
        {original?.status === 'review' ? (
          <ReviewBanner tx={original} onResolve={(same) => void resolveDuplicate(same)} />
        ) : null}
        {original?.status === 'canceled' ? (
          <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">취소된 결제입니다. 합계에는 들어가지 않습니다.</p>
        ) : null}
        <KindPicker kind={kind} onChange={changeKind} />

        <button type="button" onClick={() => setStep('amount')} className="flex w-full items-center justify-between rounded-xl bg-surface-2 px-4 py-3 text-left">
          <span className="text-sm text-muted">금액</span>
          <span className="tabular flex items-center gap-1 text-xl font-bold">
            {formatWon(amount)}
            <ChevronRight className="size-4 text-muted" aria-hidden />
          </span>
        </button>

        {transferHint ? (
          <div className="flex items-center gap-3 rounded-xl bg-brand-soft px-4 py-3 text-sm">
            <ArrowLeftRight className="size-5 shrink-0 text-brand" aria-hidden />
            <p className="flex-1">
              이체 규칙 ‘{transferHint.label}’에 해당합니다. 이체로 기록하면 지출·수입 합계에서 빠집니다.
            </p>
            <button type="button" onClick={() => changeKind('transfer')} className="shrink-0 font-semibold text-brand">
              이체로
            </button>
          </div>
        ) : null}

        {kind !== 'transfer' ? (
          <Section label="카테고리">
            {splitMode ? (
              <SplitEditor amount={amount} splits={splits} categories={categories} onChange={setSplits} />
            ) : (
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep('category')} className="flex h-12 flex-1 items-center gap-3 rounded-xl border border-line px-3 text-left">
                  <CategoryIcon category={singleCategory} size="sm" />
                  <span className="flex-1">{singleCategory?.name ?? '미분류'}</span>
                  <ChevronRight className="size-4 text-muted" aria-hidden />
                </button>
                <button type="button" onClick={startSplit} aria-label="여러 카테고리로 나누기" className="flex h-12 items-center gap-1 rounded-xl border border-line px-3 text-sm text-muted">
                  <Scissors className="size-4" aria-hidden />
                  나누기
                </button>
              </div>
            )}
          </Section>
        ) : null}

        <Section label="결제수단">
          <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
            {recentPaymentMethods.map((pm) => (
              <Chip key={pm.id} active={pm.id === paymentMethodId} onClick={() => setPaymentMethodId(pm.id === paymentMethodId ? null : pm.id)}>
                {pm.name}
              </Chip>
            ))}
            {recentPaymentMethods.length === 0 ? <p className="text-sm text-muted">더보기 → 결제수단에서 카드를 추가할 수 있습니다.</p> : null}
          </div>
          {isCredit ? (
            <div className="mt-3 flex items-center gap-2">
              <label htmlFor="installments" className="text-sm text-muted">
                할부
              </label>
              <select
                id="installments"
                value={installments}
                onChange={(e) => setInstallments(Number(e.target.value))}
                className="h-10 rounded-xl border border-line bg-surface px-3 text-[15px]"
              >
                {INSTALLMENTS.map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? '일시불' : `${n}개월`}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {!paymentMethodId && original?.payment_label ? (
            <p className="mt-2 text-sm text-muted">
              원문 표시: ‘{original.payment_label}’ · 더보기 → 결제수단에서 연결하면 다음부터 자동으로 골라집니다.
            </p>
          ) : null}
          {cashDate !== date ? (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
              <CalendarClock className="size-4" aria-hidden />
              {shortDate(cashDate)} 결제 예정{isCredit && installments > 1 ? ` · ${installments}개월 동안 매달 나눠서` : ''}
            </p>
          ) : null}
        </Section>

        <div className="grid grid-cols-2 gap-3">
          <Section label="날짜">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="h-12 w-full rounded-xl border border-line bg-surface px-3 text-[15px]" />
          </Section>
          <Section label="시각 (선택)">
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-12 w-full rounded-xl border border-line bg-surface px-3 text-[15px]" />
          </Section>
        </div>

        <Section label={kind === 'income' ? '받은 곳' : kind === 'transfer' ? '받는 사람·계좌' : '가맹점·내용'}>
          <input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            list="merchant-suggestions"
            maxLength={60}
            placeholder={kind === 'expense' ? '예: 이마트 세종점' : ''}
            className="h-12 w-full rounded-xl border border-line bg-surface px-4 text-[15px]"
          />
          <datalist id="merchant-suggestions">
            {merchantSuggestions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Section>

        <Section label="메모">
          <input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={200} className="h-12 w-full rounded-xl border border-line bg-surface px-4 text-[15px]" />
        </Section>

        {activeMembers.length > 1 ? (
          <Section label="누가 썼나요">
            <div className="flex flex-wrap gap-2">
              {activeMembers.map((m) => (
                <Chip key={m.id} active={m.id === memberId} onClick={() => setMemberId(m.id)}>
                  {m.display_name}
                </Chip>
              ))}
              <Chip active={memberId === null} onClick={() => setMemberId(null)}>
                공동
              </Chip>
            </div>
          </Section>
        ) : null}

        {original && original.source !== 'manual' ? <SourceNote tx={original} /> : null}

        <Section label="태그">
          <div className="flex flex-wrap gap-2">
            {data.tags.map((t) => (
              <Chip key={t.id} active={tagIds.includes(t.id)} onClick={() => setTagIds((ids) => (ids.includes(t.id) ? ids.filter((x) => x !== t.id) : [...ids, t.id]))}>
                #{t.name}
              </Chip>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void addTag();
              }}
              className="flex"
            >
              <input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="+ 새 태그"
                aria-label="새 태그"
                maxLength={30}
                enterKeyHint="done"
                onBlur={() => void addTag()}
                className="h-9 w-28 rounded-full border border-dashed border-line bg-transparent px-3.5 text-sm"
              />
            </form>
          </div>
        </Section>
      </div>
    </Sheet>
  );
}

const SOURCE_LABEL: Record<Transaction['source'], string> = {
  manual: '직접 입력',
  image: '사진',
  screenshot: '캡처',
  statement: '명세서',
  sms: '문자',
  push: '알림',
  share: '공유',
};

function SourceNote({ tx }: { tx: Transaction }) {
  return (
    <p className="text-xs text-muted">
      {SOURCE_LABEL[tx.source]}에서 자동으로 들어온 내역입니다
      {tx.field_sources.user_edited ? ' · 직접 고침' : ''}
    </p>
  );
}

function ReviewBanner({ tx, onResolve }: { tx: Transaction; onResolve: (same: boolean) => void }) {
  const data = useData();
  const other = tx.review?.duplicate_of ? data.transactions.find((t) => t.id === tx.review!.duplicate_of) : null;
  return (
    <div className="rounded-xl bg-expense/10 p-4">
      <p className="font-semibold text-expense">확인이 필요해요</p>
      <p className="mt-1 text-sm">{tx.review?.reason ?? '이미 있는 내역과 같은 결제인지 확인해 주세요.'}</p>
      {other ? (
        <p className="mt-1 text-sm text-muted">
          비교 대상: {other.merchant ?? '이름 없음'} · {formatWon(other.amount)} · {shortDate(toKstDate(other.occurred_at))}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" className="h-10 flex-1 text-sm" onClick={() => onResolve(true)}>
          같은 결제예요 (이건 지우기)
        </Button>
        <Button variant="secondary" className="h-10 flex-1 text-sm" onClick={() => onResolve(false)}>
          다른 결제예요
        </Button>
      </div>
    </div>
  );
}

function KindPicker({ kind, onChange }: { kind: TransactionKind; onChange: (k: TransactionKind) => void }) {
  return (
    <div className="flex">
      <Segmented
        value={kind}
        onChange={onChange}
        ariaLabel="구분"
        options={(['expense', 'income', 'transfer'] as const).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
      />
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-muted">{label}</p>
      {children}
    </div>
  );
}

/** 내가 최근에 쓴 결제수단을 앞으로. 보관한 수단은 빼되, 지금 고른 것은 남긴다. */
function useRecentPaymentMethods(memberId: string, selectedId: string | null): PaymentMethod[] {
  const data = useData();
  return useMemo(() => {
    const rank = new Map<string, number>();
    let i = 0;
    for (const tx of data.transactions) {
      if (i > 300) break;
      i += 1;
      if (tx.member_id === memberId && tx.payment_method_id && !rank.has(tx.payment_method_id)) rank.set(tx.payment_method_id, rank.size);
    }
    return data.paymentMethods
      .filter((pm) => !pm.archived || pm.id === selectedId)
      .sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9) || a.sort - b.sort);
  }, [data.transactions, data.paymentMethods, memberId, selectedId]);
}
