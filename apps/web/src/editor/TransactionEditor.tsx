import {
  computeCashDate,
  formatAmount,
  formatWon,
  fromKst,
  matchTransferRule,
  parseAmount,
  splitsAreValid,
  suggestFromTitle,
  toKstDate,
  toKstTime,
  todayKst,
  type Category,
  type PaymentMethod,
  type Split,
  type Transaction,
  type TransactionKind,
} from '@moayo/core';
import { ArrowLeftRight, CalendarClock, Plus, Scissors, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Chip, Segmented } from '../components/bits.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { Button } from '../components/ui.tsx';
import { useData } from '../data/dataContext.ts';
import { newId, useMutations } from '../data/mutations.ts';
import { KIND_LABEL, shortDate } from '../lib/format.ts';
import { useCurrentHousehold } from '../lib/householdContext.ts';
import { useOpenEditor, type EditorRequest } from './editorContext.ts';
import { ImportButtons } from './ImportSheet.tsx';
import { NewPaymentMethod } from './NewPaymentMethod.tsx';
import { SplitEditor } from './SplitEditor.tsx';

const INSTALLMENTS = [1, 2, 3, 4, 5, 6, 10, 12, 24];
const inputClass = 'h-12 w-full rounded-xl border border-line bg-surface px-4 text-[15px] outline-none focus:border-brand';

/**
 * 내역 입력·수정을 한 화면에서.
 * 제목 → 금액(휴대폰 숫자 키보드) → 카테고리(제목으로 자동 추천) → 결제수단(그 자리에서 추가 가능) → 저장.
 */
export function TransactionEditor({ request, onClose }: { request: EditorRequest; onClose: () => void }) {
  const original = request.tx;
  const data = useData();
  const me = useCurrentHousehold();
  const { save, remove } = useMutations();
  const openEditor = useOpenEditor();
  const amountRef = useRef<HTMLInputElement>(null);

  const recentPaymentMethods = useRecentPaymentMethods(me.memberId, original?.payment_method_id ?? null);

  const [kind, setKind] = useState<TransactionKind>(original?.kind ?? 'expense');
  const [merchant, setMerchant] = useState(original?.merchant ?? '');
  const [amountText, setAmountText] = useState(original ? String(original.amount) : '');
  const [splits, setSplits] = useState<Split[]>(original?.splits ?? []);
  const [splitMode, setSplitMode] = useState((original?.splits.length ?? 0) > 1);
  // 사용자가 직접 고르면 그 뒤로는 추천으로 덮지 않는다.
  const [categoryTouched, setCategoryTouched] = useState(!!original);
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(
    original ? original.payment_method_id : (recentPaymentMethods[0]?.id ?? null),
  );
  const [pmTouched, setPmTouched] = useState(!!original);
  const [addingPm, setAddingPm] = useState(false);
  const [date, setDate] = useState(original ? toKstDate(original.occurred_at) : (request.date ?? todayKst()));
  const [time, setTime] = useState(original ? (original.has_time ? toKstTime(original.occurred_at) : '') : toKstTime(new Date()));
  const [memo, setMemo] = useState(original?.memo ?? '');
  const [memberId, setMemberId] = useState<string | null>(original ? original.member_id : me.memberId);
  const [installments, setInstallments] = useState(original?.installment_months ?? 1);
  const [tagIds, setTagIds] = useState<string[]>(original?.tag_ids ?? []);
  const [newTag, setNewTag] = useState('');
  const [busy, setBusy] = useState(false);

  const amount = Number(amountText) || 0;
  const categoryKind = kind === 'income' ? 'income' : 'expense';
  const categories = data.categories.filter((c) => c.kind === categoryKind && !c.archived);

  // 제목으로 카테고리·결제수단 추천(예전 기록 → 낱말 사전). AI 를 부르지 않는다.
  const suggestion = useMemo(
    () => (kind === 'transfer' ? null : suggestFromTitle(merchant, categoryKind, data.categories, data.transactions.slice(0, 2000))),
    [merchant, kind, categoryKind, data.categories, data.transactions],
  );
  const chosenCategoryId = splits.length === 1 ? splits[0]!.category_id : null;
  const effectiveCategoryId = categoryTouched ? chosenCategoryId : (suggestion?.categoryId ?? chosenCategoryId);
  const effectivePaymentMethodId = pmTouched || !suggestion?.paymentMethodId ? paymentMethodId : suggestion.paymentMethodId;

  const paymentMethod = effectivePaymentMethodId ? data.byId.paymentMethod.get(effectivePaymentMethodId) : undefined;
  const isCredit = paymentMethod?.type === 'credit_card';
  const cashDate = original?.cash_date_override ? original.cash_date : computeCashDate(date, paymentMethod);
  const transferHint = kind !== 'transfer' ? matchTransferRule([merchant, memo], data.transferRules) : null;
  const activeMembers = data.members.filter((m) => !m.deleted_at || m.id === memberId);

  const merchantSuggestions = useMemo(() => {
    const seen = new Set<string>();
    for (const tx of data.transactions.slice(0, 500)) if (tx.merchant) seen.add(tx.merchant);
    return [...seen].slice(0, 80);
  }, [data.transactions]);

  const finalSplits: Split[] =
    kind === 'transfer'
      ? []
      : splitMode
        ? splits.filter((s) => s.amount > 0)
        : effectiveCategoryId
          ? [{ category_id: effectiveCategoryId, amount }]
          : [];
  const valid = amount > 0 && splitsAreValid(amount, finalSplits) && /^\d{4}-\d{2}-\d{2}$/.test(date);

  const changeKind = (next: TransactionKind) => {
    if (next === kind) return;
    setKind(next);
    setSplits([]);
    setSplitMode(false);
    setCategoryTouched(false);
  };

  const pickCategory = (category: Category | null) => {
    setSplits(category ? [{ category_id: category.id, amount }] : []);
    setCategoryTouched(true);
  };

  const startSplit = () => {
    setSplits([{ category_id: effectiveCategoryId, amount }]);
    setSplitMode(true);
    setCategoryTouched(true);
  };

  const pickPaymentMethod = (id: string | null) => {
    setPaymentMethodId(id);
    setPmTouched(true);
  };

  const addTag = async () => {
    const name = newTag.trim().replace(/^#/, '');
    if (!name) return;
    const existing = data.tags.find((t) => t.name === name);
    const now = new Date().toISOString();
    const tag = existing ?? (await save('tags', { id: newId(), household_id: me.householdId, created_at: now, updated_at: now, deleted_at: null, name }));
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
        original_amount: null,
      }),
      kind,
      amount,
      // 금액을 직접 바꾸면 원문의 할인 전 금액은 더 이상 맞지 않는다.
      original_amount: original && original.amount !== amount ? null : (original?.original_amount ?? null),
      occurred_at: fromKst(date, time || '12:00'),
      has_time: !!time,
      cash_date: cashDate,
      merchant: merchant.trim() || null,
      memo: memo.trim() || null,
      payment_method_id: effectivePaymentMethodId,
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
    if (same) await remove('transactions', original);
    else await save('transactions', { ...original, status: 'confirmed', review: null });
    onClose();
  };

  const destroy = async () => {
    if (!original || !window.confirm('이 내역을 지울까요?')) return;
    await remove('transactions', original);
    onClose();
  };

  const recommendedId = !categoryTouched ? (suggestion?.categoryId ?? null) : null;
  // 추천 카테고리를 맨 앞에.
  const orderedCategories = recommendedId
    ? [...categories.filter((c) => c.id === recommendedId), ...categories.filter((c) => c.id !== recommendedId)]
    : categories;

  return (
    <Sheet
      title={original ? '내역 고치기' : '내역 추가'}
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
          {amount ? `${formatWon(amount)} 저장` : '저장'}
        </Button>
      }
    >
      <div className="space-y-5 pt-1">
        {!original ? <ImportButtons onPick={(mode) => openEditor({ importMode: mode })} /> : null}
        {original?.status === 'review' ? <ReviewBanner tx={original} onResolve={(same) => void resolveDuplicate(same)} /> : null}
        {original?.status === 'canceled' ? (
          <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">취소된 결제입니다. 합계에는 들어가지 않습니다.</p>
        ) : null}

        <div className="flex">
          <Segmented
            value={kind}
            onChange={changeKind}
            ariaLabel="구분"
            options={(['expense', 'income', 'transfer'] as const).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
          />
        </div>

        {/* 1) 제목 */}
        <Section label={kind === 'income' ? '어디서 받았나요' : kind === 'transfer' ? '누구에게·어느 계좌로' : '어디에 썼나요'}>
          <input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            list="merchant-suggestions"
            maxLength={60}
            autoFocus={!original}
            enterKeyHint="next"
            aria-label="제목"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                amountRef.current?.focus();
              }
            }}
            placeholder={kind === 'expense' ? '예: 이마트 세종점, 점심 김밥' : kind === 'income' ? '예: 11월 급여' : '예: 엄마에게, 내 저축계좌'}
            className={inputClass}
          />
          <datalist id="merchant-suggestions">
            {merchantSuggestions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Section>

        {/* 2) 금액: 휴대폰 기본 숫자 키보드 */}
        <Section label="금액">
          <div className="relative">
            <input
              ref={amountRef}
              value={amountText ? formatAmount(amount) : ''}
              onChange={(e) => setAmountText(String(parseAmount(e.target.value) ?? '').slice(0, 12))}
              inputMode="numeric"
              pattern="[0-9,]*"
              enterKeyHint="done"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              placeholder="0"
              aria-label="금액"
              className={`${inputClass} tabular pr-10 text-right text-xl font-bold`}
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted">원</span>
          </div>
        </Section>

        {transferHint ? (
          <div className="flex items-center gap-3 rounded-xl bg-brand-soft px-4 py-3 text-sm">
            <ArrowLeftRight className="size-5 shrink-0 text-brand" aria-hidden />
            <p className="flex-1">‘{transferHint.label}’은(는) 우리끼리 이체 대상입니다. 바꾸면 지출·수입 합계에서 빠집니다.</p>
            <button type="button" onClick={() => changeKind('transfer')} className="shrink-0 font-semibold text-brand">
              바꾸기
            </button>
          </div>
        ) : null}

        {/* 3) 카테고리: 제목으로 추천 */}
        {kind !== 'transfer' ? (
          <Section
            label="카테고리"
            extra={
              splitMode ? (
                <button type="button" onClick={() => setSplitMode(false)} className="text-sm text-muted">
                  나누기 취소
                </button>
              ) : (
                <button type="button" onClick={startSplit} className="flex items-center gap-1 text-sm text-muted">
                  <Scissors className="size-4" aria-hidden />
                  나눠서 기록
                </button>
              )
            }
          >
            {splitMode ? (
              <SplitEditor amount={amount} splits={splits} categories={categories} onChange={setSplits} />
            ) : (
              <div className="flex flex-wrap gap-2">
                {orderedCategories.map((c) => (
                  <Chip key={c.id} active={c.id === effectiveCategoryId} onClick={() => pickCategory(c.id === effectiveCategoryId ? null : c)}>
                    {c.id === recommendedId ? <Sparkles className="size-3.5" aria-label="추천" /> : null}
                    <span aria-hidden>{c.icon}</span>
                    {c.name}
                  </Chip>
                ))}
              </div>
            )}
            {recommendedId && !splitMode ? (
              <p className="mt-1.5 text-xs text-muted">
                {suggestion?.reason === 'keyword' ? '이름으로 추천했어요.' : '예전에 같은 곳에 쓴 카테고리예요.'} 다른 것을 누르면 바뀝니다.
              </p>
            ) : null}
          </Section>
        ) : null}

        {/* 4) 결제수단: 그 자리에서 추가 */}
        <Section label={kind === 'income' ? '받은 곳(계좌 등)' : '결제수단'}>
          <div className="flex flex-wrap gap-2">
            {recentPaymentMethods.map((pm) => (
              <Chip key={pm.id} active={pm.id === effectivePaymentMethodId} onClick={() => pickPaymentMethod(pm.id === effectivePaymentMethodId ? null : pm.id)}>
                {pm.name}
              </Chip>
            ))}
            <Chip onClick={() => setAddingPm((v) => !v)} active={addingPm}>
              <Plus className="size-4" aria-hidden />
              추가
            </Chip>
          </div>
          {addingPm ? (
            <NewPaymentMethod
              onCancel={() => setAddingPm(false)}
              onCreated={(pm) => {
                pickPaymentMethod(pm.id);
                setAddingPm(false);
              }}
            />
          ) : null}
          {!effectivePaymentMethodId && original?.payment_label ? (
            <p className="mt-2 text-sm text-muted">원문 표시: ‘{original.payment_label}’ · 더보기 → 결제수단에서 연결하면 다음부터 자동으로 골라집니다.</p>
          ) : null}
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
          {cashDate !== date ? (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
              <CalendarClock className="size-4" aria-hidden />
              {shortDate(cashDate)} 결제 예정{isCredit && installments > 1 ? ` · ${installments}개월 동안 매달 나눠서` : ''}
            </p>
          ) : null}
        </Section>

        <div className="grid grid-cols-2 gap-3">
          <Section label="날짜">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={inputClass} />
          </Section>
          <Section label="시각 (선택)">
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
          </Section>
        </div>

        <Section label="메모">
          <input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={200} className={inputClass} />
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

        <Section label="태그">
          <div className="flex flex-wrap gap-2">
            {data.tags.map((t) => (
              <Chip key={t.id} active={tagIds.includes(t.id)} onClick={() => setTagIds((ids) => (ids.includes(t.id) ? ids.filter((x) => x !== t.id) : [...ids, t.id]))}>
                #{t.name}
              </Chip>
            ))}
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void addTag();
                }
              }}
              onBlur={() => void addTag()}
              placeholder="+ 새 태그"
              aria-label="새 태그"
              maxLength={30}
              enterKeyHint="done"
              className="h-9 w-28 rounded-full border border-dashed border-line bg-transparent px-3.5 text-sm"
            />
          </div>
        </Section>

        {original && original.source !== 'manual' ? <SourceNote tx={original} /> : null}
      </div>
    </Sheet>
  );
}

function Section({ label, extra, children }: { label: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-muted">{label}</p>
        {extra}
      </div>
      {children}
    </div>
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
