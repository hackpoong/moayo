import {
  computeCashDate,
  evalAmountExpression,
  formatAmount,
  formatAmountExpression,
  formatWon,
  fromKst,
  hasOperator,
  matchTransferRule,
  splitsAreValid,
  suggestFromTitle,
  titleSuggestions,
  toKstDate,
  toKstTime,
  todayKst,
  type Category,
  type Member,
  type PaymentMethod,
  type Split,
  type Transaction,
  type TransactionKind,
} from '@moayo/core';
import { ArrowLeft, ArrowLeftRight, Camera, MessageSquareText, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { MemberBadge } from '../components/MemberBadge.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { useToast } from '../components/toastContext.ts';
import { Button } from '../components/ui.tsx';
import { useData } from '../data/dataContext.ts';
import { baseRow, newId, useMutations } from '../data/mutations.ts';
import { flashRow, haptic } from '../lib/flash.ts';
import { KIND_LABEL, shortDate, weekday } from '../lib/format.ts';
import { useCurrentHousehold } from '../lib/householdContext.ts';
import { useOpenEditor, type EditorRequest } from './editorContext.ts';
import { AmountPanel, AssetPanel, CategoryPanel, type PanelKind } from './InputPanel.tsx';
import { NewPaymentMethod } from './NewPaymentMethod.tsx';
import { QuickAddCategory } from './QuickAddCategory.tsx';
import { SplitEditor } from './SplitEditor.tsx';

const INSTALLMENTS = [1, 2, 3, 4, 5, 6, 10, 12, 24];

const KIND_STYLE: Record<TransactionKind, string> = {
  income: 'border-income text-income',
  expense: 'border-expense text-expense',
  transfer: 'border-transfer text-transfer',
};

/**
 * 내역 입력·수정 화면(전체 화면).
 * 날짜 → 제목 → 금액 → 분류 → 자산 → 태그 → 메모. 금액·분류·자산은 키보드 자리에 뜨는 앱 입력판으로 이어진다.
 */
export function TransactionEditor({ request, onClose }: { request: EditorRequest; onClose: () => void }) {
  const original = request.tx;
  const data = useData();
  const me = useCurrentHousehold();
  const { save, remove } = useMutations();
  const openEditor = useOpenEditor();
  const toast = useToast();
  const titleRef = useRef<HTMLInputElement>(null);

  const activeMembers = useMemo(() => data.members.filter((m) => !m.deleted_at), [data.members]);
  const myMember = activeMembers.find((m) => m.id === me.memberId) ?? null;
  const lastPaymentMethodId = useMemo(() => {
    for (const tx of data.transactions.slice(0, 200)) if (tx.member_id === me.memberId && tx.payment_method_id) return tx.payment_method_id;
    return null;
  }, [data.transactions, me.memberId]);

  const [kind, setKind] = useState<TransactionKind>(original?.kind ?? 'expense');
  const [title, setTitle] = useState(original?.merchant ?? '');
  const [titleFocused, setTitleFocused] = useState(false);
  const [amountExpr, setAmountExpr] = useState(original ? String(original.amount) : '');
  const [splits, setSplits] = useState<Split[]>(original?.splits ?? []);
  const [splitMode, setSplitMode] = useState((original?.splits.length ?? 0) > 1);
  const [categoryTouched, setCategoryTouched] = useState(!!original);
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(original ? original.payment_method_id : lastPaymentMethodId);
  const [pmTouched, setPmTouched] = useState(!!original);
  const [memberId, setMemberId] = useState<string | null>(original ? original.member_id : me.memberId);
  const [date, setDate] = useState(original ? toKstDate(original.occurred_at) : (request.date ?? todayKst()));
  const [time, setTime] = useState(original ? (original.has_time ? toKstTime(original.occurred_at) : '') : toKstTime(new Date()));
  const [memo, setMemo] = useState(original?.memo ?? '');
  const [installments, setInstallments] = useState(original?.installment_months ?? 1);
  const [tagIds, setTagIds] = useState<string[]>(original?.tag_ids ?? []);
  const [newTag, setNewTag] = useState('');
  const [panel, setPanel] = useState<PanelKind | null>(null);
  const [viewingMemberId, setViewingMemberId] = useState<string | null>(null);
  const [adding, setAdding] = useState<'category' | 'asset' | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  const amount = evalAmountExpression(amountExpr) ?? 0;
  const categoryKind = kind === 'income' ? 'income' : 'expense';
  const categories = data.categories.filter((c) => c.kind === categoryKind && !c.archived);

  // 제목으로 분류·자산 추천(예전 기록 → 낱말 사전). AI 를 부르지 않는다.
  const suggestion = useMemo(
    () => (kind === 'transfer' ? null : suggestFromTitle(title, categoryKind, data.categories, data.transactions.slice(0, 2000))),
    [title, kind, categoryKind, data.categories, data.transactions],
  );
  const titleChoices = useMemo(
    () => (titleFocused && title.trim().length >= 1 ? titleSuggestions(title, kind, data.transactions.slice(0, 3000), 4) : []),
    [titleFocused, title, kind, data.transactions],
  );

  const chosenCategoryId = splits.length === 1 ? splits[0]!.category_id : null;
  const categoryId = categoryTouched ? chosenCategoryId : (suggestion?.categoryId ?? chosenCategoryId);
  const recommendedId = !categoryTouched ? (suggestion?.categoryId ?? null) : null;
  const effectivePmId = pmTouched || !suggestion?.paymentMethodId ? paymentMethodId : suggestion.paymentMethodId;
  const paymentMethod = effectivePmId ? data.byId.paymentMethod.get(effectivePmId) : undefined;
  // 쓴 사람: 자산 주인. 같이 쓰는 자산이면 고를 때 보고 있던 사람.
  const effectiveMemberId = paymentMethod?.owner_member_id ?? memberId;
  const member = effectiveMemberId ? (data.byId.member.get(effectiveMemberId) ?? null) : null;
  const isCredit = paymentMethod?.type === 'credit_card';
  const cashDate = original?.cash_date_override ? original.cash_date : computeCashDate(date, paymentMethod);
  const transferHint = kind !== 'transfer' ? matchTransferRule([title, memo], data.transferRules) : null;
  const category = categoryId ? data.byId.category.get(categoryId) : null;

  const finalSplits: Split[] =
    kind === 'transfer' ? [] : splitMode ? splits.filter((s) => s.amount > 0) : categoryId ? [{ category_id: categoryId, amount }] : [];
  const valid = amount > 0 && splitsAreValid(amount, finalSplits) && /^\d{4}-\d{2}-\d{2}$/.test(date);

  // 자산 입력판에서 보고 있는 사람: 직접 바꾼 사람 → 고른 자산의 주인 → 나 → 첫 구성원.
  const viewingMember: Member | null = pickViewingMember();
  function pickViewingMember(): Member | null {
    const byId = (id: string | null | undefined) => (id ? (data.byId.member.get(id) ?? null) : null);
    return byId(viewingMemberId) ?? byId(paymentMethod?.owner_member_id) ?? myMember ?? activeMembers[0] ?? null;
  }

  // ── 흐름: 제목 → 금액 → 분류 → 자산 ──────────────────────────────────────
  const openPanel = (p: PanelKind | null) => {
    if (p) titleRef.current?.blur();
    setPanel(p);
  };
  const afterAmount = () => openPanel(kind === 'transfer' ? 'asset' : splitMode ? null : 'category');

  const changeKind = (next: TransactionKind) => {
    if (next === kind) return;
    setKind(next);
    setSplits([]);
    setSplitMode(false);
    setCategoryTouched(false);
  };

  const pickTitle = (s: { title: string; categoryId: string | null; paymentMethodId: string | null }) => {
    setTitle(s.title);
    if (s.categoryId && !categoryTouched) {
      setSplits([{ category_id: s.categoryId, amount }]);
      setCategoryTouched(true);
    }
    if (s.paymentMethodId && !pmTouched && data.byId.paymentMethod.get(s.paymentMethodId) && !data.byId.paymentMethod.get(s.paymentMethodId)?.deleted_at) {
      setPaymentMethodId(s.paymentMethodId);
      setPmTouched(true);
    }
    setTitleFocused(false);
    openPanel('amount');
  };

  const pickCategory = (c: Category | null) => {
    setSplits(c ? [{ category_id: c.id, amount }] : []);
    setCategoryTouched(true);
    openPanel(pmTouched && effectivePmId ? null : 'asset');
  };

  const pickAsset = (pm: PaymentMethod) => {
    setPaymentMethodId(pm.id);
    setPmTouched(true);
    setMemberId(pm.owner_member_id ?? viewingMember?.id ?? me.memberId);
    openPanel(null);
  };

  const nextMember = () => {
    if (activeMembers.length < 2) return;
    const i = activeMembers.findIndex((m) => m.id === viewingMember?.id);
    setViewingMemberId(activeMembers[(i + 1) % activeMembers.length]!.id);
  };

  const startSplit = () => {
    setSplits([{ category_id: categoryId, amount }]);
    setSplitMode(true);
    setCategoryTouched(true);
    openPanel(null);
  };

  const addTag = () => {
    const name = newTag.trim().replace(/^#/, '');
    if (!name) return;
    const existing = data.tags.find((t) => t.name === name);
    const tag = existing ?? { ...baseRow(me.householdId), name };
    if (!existing) void save('tags', tag);
    setTagIds((ids) => (ids.includes(tag.id) ? ids : [...ids, tag.id]));
    setNewTag('');
  };

  // ── 저장: 기다리지 않고 바로 닫는다(화면에는 즉시 보이고 기록은 뒤에서) ────────
  const buildRow = (): Transaction => {
    const now = new Date().toISOString();
    return {
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
      original_amount: original && original.amount !== amount ? null : (original?.original_amount ?? null),
      occurred_at: fromKst(date, time || '12:00'),
      has_time: !!time,
      cash_date: cashDate,
      merchant: title.trim() || null,
      memo: memo.trim() || null,
      payment_method_id: effectivePmId,
      member_id: effectiveMemberId,
      installment_months: isCredit ? installments : 1,
      splits: finalSplits,
      tag_ids: tagIds,
      status: original?.status === 'review' ? 'confirmed' : (original?.status ?? 'confirmed'),
      review: null,
      field_sources: original && original.source !== 'manual' ? { ...original.field_sources, user_edited: 'true' } : (original?.field_sources ?? {}),
    };
  };

  const persist = (row: Transaction) => {
    haptic(12);
    flashRow(row.id);
    save('transactions', row).catch(() => toast({ message: '기기에 저장하지 못했습니다. 다시 시도해 주세요.', tone: 'error' }));
    toast({
      message: original ? '고쳤어요' : `${formatWon(row.amount)} 저장했어요`,
      action: {
        label: '되돌리기',
        onClick: () => void (original ? save('transactions', original) : remove('transactions', row)),
      },
    });
  };

  const submit = (close: () => void) => {
    if (!valid) return;
    persist(buildRow());
    close();
  };

  /** 저장하고 바로 다음 입력. 날짜·자산·쓴 사람은 그대로 두고 나머지는 비운다. */
  const submitAndContinue = () => {
    if (!valid) return;
    persist(buildRow());
    setSavedCount((n) => n + 1);
    setTitle('');
    setAmountExpr('');
    setSplits([]);
    setSplitMode(false);
    setCategoryTouched(false);
    setTagIds([]);
    setMemo('');
    setPanel(null);
    requestAnimationFrame(() => titleRef.current?.focus());
  };

  const resolveDuplicate = (same: boolean, close: () => void) => {
    if (!original) return;
    void (same ? remove('transactions', original) : save('transactions', { ...original, status: 'confirmed', review: null }));
    close();
  };

  const destroy = (close: () => void) => {
    if (!original || !window.confirm('이 내역을 지울까요?')) return;
    void remove('transactions', original);
    toast({ message: '지웠어요', action: { label: '되돌리기', onClick: () => void save('transactions', { ...original, deleted_at: null }) } });
    close();
  };

  // 패널이 열리면 그 자리만큼 본문 아래를 띄운다.
  const panelNode =
    panel === 'amount' ? (
      <AmountPanel
        expr={amountExpr}
        onChange={setAmountExpr}
        onDone={() => {
          const v = evalAmountExpression(amountExpr);
          if (v !== null && hasOperator(amountExpr)) setAmountExpr(String(v));
          afterAmount();
        }}
        onClose={() => openPanel(null)}
      />
    ) : panel === 'category' ? (
      <CategoryPanel
        categories={categories}
        selectedId={categoryId}
        recommendedId={recommendedId}
        onPick={pickCategory}
        onAdd={() => setAdding('category')}
        onSplit={startSplit}
        onClose={() => openPanel(null)}
      />
    ) : panel === 'asset' ? (
      <AssetPanel
        methods={data.paymentMethods}
        members={activeMembers}
        viewingMember={viewingMember}
        selectedId={effectivePmId}
        onPick={pickAsset}
        onNextMember={nextMember}
        onAdd={() => setAdding('asset')}
        onClose={() => openPanel(null)}
      />
    ) : null;

  const dateLabel = `${date.slice(2, 4)}. ${Number(date.slice(5, 7))}. ${Number(date.slice(8, 10))}. (${weekday(date)})`;
  const timeLabel = time ? `${Number(time.slice(0, 2)) < 12 ? '오전' : '오후'} ${((Number(time.slice(0, 2)) + 11) % 12) + 1}:${time.slice(3, 5)}` : '시각 없음';

  return (
    <>
      <Sheet
        title={original ? '내역 고치기' : KIND_LABEL[kind]}
        onClose={onClose}
        full
        onBack={() => {
          if (!panel) return false;
          setPanel(null);
          return true;
        }}
        header={(close) => (
          <div className="flex h-14 items-center gap-1 px-2">
            <button type="button" aria-label="닫기" onClick={close} className="press flex size-11 items-center justify-center rounded-full">
              <ArrowLeft className="size-6" aria-hidden />
            </button>
            <h2 className="min-w-0 flex-1 truncate text-lg font-bold">
              {original ? `${KIND_LABEL[kind]} 고치기` : KIND_LABEL[kind]}
              {savedCount ? <span className="ml-2 text-sm font-medium text-muted">{savedCount}건 저장함</span> : null}
            </h2>
            {original ? (
              <button type="button" aria-label="지우기" onClick={() => destroy(close)} className="press flex size-11 items-center justify-center rounded-full text-muted">
                <Trash2 className="size-5" aria-hidden />
              </button>
            ) : (
              <>
                <button type="button" aria-label="사진·캡처로 넣기" onClick={() => openEditor({ importMode: 'image' })} className="press flex size-11 items-center justify-center rounded-full text-muted">
                  <Camera className="size-6" aria-hidden />
                </button>
                <button type="button" aria-label="문자로 넣기" onClick={() => openEditor({ importMode: 'text' })} className="press flex size-11 items-center justify-center rounded-full text-muted">
                  <MessageSquareText className="size-6" aria-hidden />
                </button>
              </>
            )}
          </div>
        )}
        footer={(close) => (
          <div className="flex gap-2">
            <Button block disabled={!valid} onClick={() => submit(close)}>
              {amount ? `${formatWon(amount)} 저장` : '저장'}
            </Button>
            {!original ? (
              <Button variant="secondary" disabled={!valid} onClick={submitAndContinue} className="shrink-0 px-5">
                계속
              </Button>
            ) : null}
          </div>
        )}
        overlay={panelNode}
      >
        {(close) => (
        <div className={`space-y-4 px-5 pt-2 ${panel ? 'pb-[46dvh]' : 'pb-6'}`} onClick={() => panel && openPanel(null)}>
          {/* 구분 */}
          <div className="grid grid-cols-3 gap-2">
            {(['income', 'expense', 'transfer'] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={k === kind}
                onClick={() => changeKind(k)}
                className={`press h-11 rounded-xl border-2 text-[15px] font-semibold ${k === kind ? `${KIND_STYLE[k]} bg-surface` : 'border-transparent bg-surface-2 text-muted'}`}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>

          {original?.status === 'review' ? (
            <ReviewBanner tx={original} onResolve={(same) => resolveDuplicate(same, close)} />
          ) : null}
          {original?.status === 'canceled' ? <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">취소된 결제입니다. 합계에는 들어가지 않습니다.</p> : null}

          <div>
            {/* 1) 날짜 */}
            <Row label="날짜">
              <div className="flex flex-1 items-center gap-3">
                <label className="relative">
                  <span className="text-[17px]">{dateLabel}</span>
                  <input type="date" aria-label="날짜" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="absolute inset-0 opacity-0" />
                </label>
                <label className="relative">
                  <span className="text-[17px]">{timeLabel}</span>
                  <input type="time" aria-label="시각" value={time} onChange={(e) => setTime(e.target.value)} className="absolute inset-0 opacity-0" />
                </label>
              </div>
              <label className={`relative ml-auto flex flex-col items-center text-[11px] ${isCredit ? 'text-brand' : 'text-muted/50'}`}>
                <span className="text-sm font-semibold">{installments > 1 && isCredit ? `${installments}개월` : '할부'}</span>
                {isCredit ? (
                  <select aria-label="할부" value={installments} onChange={(e) => setInstallments(Number(e.target.value))} className="absolute inset-0 opacity-0">
                    {INSTALLMENTS.map((n) => (
                      <option key={n} value={n}>
                        {n === 1 ? '일시불' : `${n}개월`}
                      </option>
                    ))}
                  </select>
                ) : null}
              </label>
            </Row>

            {/* 2) 제목 */}
            <Row label="제목" active={titleFocused}>
              <input
                ref={titleRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onFocus={() => {
                  setTitleFocused(true);
                  setPanel(null);
                }}
                onBlur={() => window.setTimeout(() => setTitleFocused(false), 120)}
                autoFocus={!original}
                enterKeyHint="next"
                maxLength={60}
                aria-label="제목"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    openPanel('amount');
                  }
                }}
                placeholder={kind === 'income' ? '예: 11월 급여' : kind === 'transfer' ? '예: 엄마에게' : '예: 맥도날드'}
                className="min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted/50"
              />
              {title ? (
                <button type="button" aria-label="제목 지우기" onClick={() => setTitle('')} className="press -mr-1 rounded-full p-1 text-muted">
                  <X className="size-4" aria-hidden />
                </button>
              ) : null}
            </Row>
            {titleChoices.length ? (
              <div className="flex flex-wrap gap-2 py-2 pl-16" role="listbox" aria-label="예전 제목">
                {titleChoices.map((s) => {
                  const c = s.categoryId ? data.byId.category.get(s.categoryId) : null;
                  return (
                    <button
                      key={s.title}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => pickTitle(s)}
                      className="press flex h-9 max-w-full items-center gap-1.5 rounded-full bg-surface-2 px-3 text-sm"
                    >
                      {c?.icon ? <span aria-hidden>{c.icon}</span> : null}
                      <span className="truncate">{s.title}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {/* 3) 금액 */}
            <Row label="금액" active={panel === 'amount'} onClick={() => openPanel('amount')}>
              <span className={`tabular flex-1 text-[19px] font-semibold ${amountExpr ? '' : 'text-muted/50'}`}>
                {amountExpr ? (hasOperator(amountExpr) ? formatAmountExpression(amountExpr) : `${formatAmount(amount)}원`) : '0원'}
              </span>
            </Row>

            {/* 4) 분류 */}
            {kind !== 'transfer' ? (
              <Row label="분류" active={panel === 'category'} onClick={() => !splitMode && openPanel('category')}>
                {splitMode ? (
                  <span className="text-[17px]">{splits.length}개로 나눔</span>
                ) : (
                  <span className={`flex flex-1 items-center gap-2 text-[17px] ${category ? '' : 'text-muted/50'}`}>
                    {category ? (
                      <>
                        <span aria-hidden>{category.icon}</span>
                        {category.name}
                        {recommendedId === category.id ? <Sparkles className="size-4 text-brand" aria-label="제목으로 추천" /> : null}
                      </>
                    ) : (
                      '미분류'
                    )}
                  </span>
                )}
              </Row>
            ) : null}
            {splitMode ? (
              <div className="py-3 pl-16">
                <SplitEditor amount={amount} splits={splits} categories={categories} onChange={setSplits} />
                <button type="button" onClick={() => setSplitMode(false)} className="mt-1 text-sm text-muted underline">
                  나누기 취소
                </button>
              </div>
            ) : null}

            {/* 5) 자산 */}
            <Row label={kind === 'transfer' ? '보낸 곳' : kind === 'income' ? '받은 곳' : '자산'} active={panel === 'asset'} onClick={() => openPanel('asset')}>
              <span className={`flex flex-1 items-center gap-2 text-[17px] ${paymentMethod ? '' : 'text-muted/50'}`}>
                {activeMembers.length > 1 && member ? <MemberBadge member={member} size="md" /> : null}
                {activeMembers.length > 1 && member && paymentMethod ? <span className="text-muted">·</span> : null}
                {paymentMethod?.name ?? (original?.payment_label ? `‘${original.payment_label}’` : '선택')}
              </span>
            </Row>
            {cashDate !== date ? (
              <p className="py-1.5 pl-16 text-xs text-muted">
                {shortDate(cashDate)} 결제 예정{isCredit && installments > 1 ? ` · ${installments}개월 나눠서` : ''}
              </p>
            ) : null}
          </div>

          {transferHint ? (
            <div className="flex items-center gap-3 rounded-xl bg-brand-soft px-4 py-3 text-sm">
              <ArrowLeftRight className="size-5 shrink-0 text-brand" aria-hidden />
              <p className="flex-1">‘{transferHint.label}’은(는) 우리끼리 이체 대상입니다.</p>
              <button type="button" onClick={() => changeKind('transfer')} className="shrink-0 font-semibold text-brand">
                바꾸기
              </button>
            </div>
          ) : null}

          {/* 6) 태그 */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {tagIds.map((id) => {
              const t = data.byId.tag.get(id);
              return t ? (
                <button key={id} type="button" onClick={() => setTagIds((ids) => ids.filter((x) => x !== id))} className="press flex h-9 items-center gap-1 rounded-full border border-fg/70 px-3 text-sm">
                  {t.name}
                  <X className="size-3.5" aria-label="태그 빼기" />
                </button>
              ) : null;
            })}
            {data.tags
              .filter((t) => !tagIds.includes(t.id))
              .slice(0, 6)
              .map((t) => (
                <button key={t.id} type="button" onClick={() => setTagIds((ids) => [...ids, t.id])} className="press h-9 rounded-full bg-surface-2 px-3 text-sm text-muted">
                  #{t.name}
                </button>
              ))}
            <span className="flex h-9 items-center gap-1 rounded-full bg-surface-2 pl-3 pr-1 text-sm text-muted">
              <Plus className="size-4" aria-hidden />
              <input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                onBlur={addTag}
                onFocus={() => setPanel(null)}
                placeholder="태그"
                aria-label="새 태그"
                maxLength={30}
                enterKeyHint="done"
                className="w-20 bg-transparent outline-none"
              />
            </span>
          </div>

          {/* 7) 메모 */}
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            onFocus={() => setPanel(null)}
            maxLength={200}
            placeholder="메모"
            aria-label="메모"
            className="h-12 w-full border-b border-line bg-transparent text-[16px] outline-none placeholder:text-muted/60 focus:border-brand"
          />

          {original && original.source !== 'manual' ? (
            <p className="text-xs text-muted">
              자동으로 들어온 내역입니다{original.field_sources.user_edited ? ' · 직접 고침' : ''}
            </p>
          ) : null}
        </div>
        )}
      </Sheet>

      {adding === 'category' ? (
        <QuickAddCategory
          kind={categoryKind}
          onClose={() => setAdding(null)}
          onCreated={(c) => {
            setAdding(null);
            pickCategory(c);
          }}
        />
      ) : null}
      {adding === 'asset' ? (
        <Sheet title={`${viewingMember && activeMembers.length > 1 ? `${viewingMember.display_name}의 ` : ''}자산 추가`} onClose={() => setAdding(null)}>
          <NewPaymentMethod
            ownerMemberId={activeMembers.length > 1 ? (viewingMember?.id ?? null) : null}
            onCancel={() => setAdding(null)}
            onCreated={(pm) => {
              setAdding(null);
              pickAsset(pm);
            }}
          />
        </Sheet>
      ) : null}
    </>
  );
}

function Row({ label, active, onClick, children }: { label: string; active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <div
      onClick={(e) => {
        if (!onClick) return;
        e.stopPropagation();
        onClick();
      }}
      className={`flex min-h-14 items-center gap-3 ${onClick ? 'cursor-pointer' : ''}`}
    >
      <span className="w-12 shrink-0 text-[15px] text-muted">{label}</span>
      <div className={`flex min-h-14 flex-1 items-center border-b-2 transition-colors ${active ? 'border-brand' : 'border-line'}`}>{children}</div>
    </div>
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
