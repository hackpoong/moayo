import {
  computeCashDate,
  editAmount,
  rebalance,
  evalAmountExpression,
  formatAmount,
  formatAmountExpression,
  formatWon,
  fromKst,
  hasOperator,
  matchTransferRule,
  parseSpokenEntry,
  unmergeTransactions,
  memberTransferRules,
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
import { ArrowLeft, ArrowLeftRight, Camera, Check, History, MessageSquareText, Plus, Repeat, Sparkles, Trash2, X } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { InfoTip } from '../components/InfoTip.tsx';
import { MemberBadge } from '../components/MemberBadge.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { useToast } from '../components/toastContext.ts';
import { useBulkRename } from '../bulk/bulkContext.ts';
import { Button } from '../components/ui.tsx';
import { useData } from '../data/dataContext.ts';
import { baseRow, newId, useMutations } from '../data/mutations.ts';
import { assetIcon } from '../lib/assets.ts';
import { flashRow, haptic } from '../lib/flash.ts';
import { KIND_LABEL, shortDate, weekday } from '../lib/format.ts';
import { useCurrentHousehold } from '../lib/householdContext.ts';
import { useOpenEditor, type EditorRequest } from './editorContext.ts';
import { AmountPanel, AssetPanel, CategoryPanel, type PanelKind } from './InputPanel.tsx';
import { AssetManagerSheet } from '../manage/AssetManager.tsx';
import { CategoryManagerSheet } from '../manage/CategoryManager.tsx';
import { VoiceButton } from './VoiceButton.tsx';
import { RepeatSheet } from './RepeatSheet.tsx';
import { ActivityLogSheet } from '../components/ActivityLog.tsx';
import { ACTION_LABEL, whenLabel } from '../lib/activity.ts';

type PayRow = { payment_method_id: string | null; member_id: string | null; amount: number };


const KIND_ORDER = ['income', 'expense', 'transfer'] as const;

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
  const askBulkRename = useBulkRename();
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
  // 분류 다중선택: 분류 줄마다 금액. 직접 고친 줄 표시(나머지는 고치지 않은 줄이 나눠 가짐).
  const [catMulti, setCatMulti] = useState((original?.splits.length ?? 0) > 1);
  const [splitEdited, setSplitEdited] = useState<boolean[]>(() => (original?.splits ?? []).map(() => true));
  // 자산 다중선택: 자산 줄마다 금액과 낸 사람.
  const initialPays = original?.payments && original.payments.length > 1 ? original.payments.map(({ payment_method_id, member_id, amount }) => ({ payment_method_id, member_id, amount })) : [];
  const [payMulti, setPayMulti] = useState(initialPays.length > 1);
  const [pays, setPays] = useState<PayRow[]>(initialPays);
  const [payEdited, setPayEdited] = useState<boolean[]>(() => initialPays.map(() => true));
  // 숫자패드가 지금 채우는 곳: 전체 금액(null) 또는 분류·자산 줄 하나.
  const [amountTarget, setAmountTarget] = useState<{ kind: 'split' | 'pay'; index: number } | null>(null);
  const [rowExpr, setRowExpr] = useState('');
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
  // '계속'으로 저장하면 버튼이 잠깐 ✓ 로 바뀐다.
  const [justSaved, setJustSaved] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [repeatOpen, setRepeatOpen] = useState(false);
  // 반복: 매달 같은 날 자동으로 기록. times 가 null 이면 끝 없음.
  const [repeat, setRepeat] = useState<{ on: boolean; times: number | null }>({ on: false, times: null });
  const sourceRule = original?.field_sources.recurring_rule ? data.recurringRules.find((r) => r.id === original.field_sources.recurring_rule) : undefined;

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
  const allTransferRules = useMemo(() => [...data.transferRules, ...memberTransferRules(data.members)], [data.transferRules, data.members]);
  const transferHint = kind !== 'transfer' ? matchTransferRule([title, memo], allTransferRules) : null;
  const category = categoryId ? data.byId.category.get(categoryId) : null;

  const finalSplits: Split[] =
    kind === 'transfer' ? [] : catMulti ? splits.filter((s) => s.amount > 0) : categoryId ? [{ category_id: categoryId, amount }] : [];
  const splitGap = catMulti && kind !== 'transfer' ? amount - splits.reduce((t, x) => t + x.amount, 0) : 0;
  const payGap = payMulti ? amount - pays.reduce((t, x) => t + x.amount, 0) : 0;
  const valid =
    amount > 0 && splitGap === 0 && payGap === 0 && (!payMulti || pays.length > 0) && splitsAreValid(amount, finalSplits) && /^\d{4}-\d{2}-\d{2}$/.test(date);

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
  const afterAmount = () => openPanel(kind === 'transfer' ? 'asset' : 'category');

  /** 전체 금액이 정해지면 다중선택 줄들의 금액을 다시 나눈다(직접 고친 줄은 그대로). */
  const rebalanceAll = (total: number) => {
    if (catMulti && splits.length) {
      const next = rebalance(total, splits.map((x) => x.amount), splitEdited);
      setSplits(splits.map((x, i) => ({ ...x, amount: next[i]! })));
    }
    if (payMulti && pays.length) {
      const next = rebalance(total, pays.map((x) => x.amount), payEdited);
      setPays(pays.map((x, i) => ({ ...x, amount: next[i]! })));
    }
  };

  const toggleCatMulti = () => {
    haptic(8);
    if (catMulti) {
      const first = splits[0];
      setSplits(first ? [{ category_id: first.category_id, amount }] : []);
      setSplitEdited([]);
      setCatMulti(false);
      return;
    }
    setSplits(categoryId ? [{ category_id: categoryId, amount }] : []);
    setSplitEdited(categoryId ? [false] : []);
    setCategoryTouched(true);
    setCatMulti(true);
  };

  const togglePayMulti = () => {
    haptic(8);
    if (payMulti) {
      const first = [...pays].sort((a, b) => b.amount - a.amount)[0];
      if (first?.payment_method_id) {
        setPaymentMethodId(first.payment_method_id);
        setMemberId(first.member_id);
        setPmTouched(true);
      }
      setPays([]);
      setPayEdited([]);
      setPayMulti(false);
      return;
    }
    if (isCredit && installments > 1) {
      toast({ message: '할부와 자산 여러 개는 함께 쓸 수 없어요. 할부를 일시불로 바꾼 뒤 고르세요.' });
      return;
    }
    setPays(effectivePmId ? [{ payment_method_id: effectivePmId, member_id: effectiveMemberId, amount }] : []);
    setPayEdited(effectivePmId ? [false] : []);
    setPmTouched(true);
    setPayMulti(true);
  };

  const editRowAmount = (target: { kind: 'split' | 'pay'; index: number }) => {
    setAmountTarget(target);
    setRowExpr('');
    openPanel('amount');
  };

  const removeSplit = (i: number) => {
    const rows = splits.filter((_, k) => k !== i);
    const flags = splitEdited.filter((_, k) => k !== i);
    const next = rebalance(amount, rows.map((x) => x.amount), flags);
    setSplits(rows.map((x, k) => ({ ...x, amount: next[k]! })));
    setSplitEdited(flags);
  };
  const removePay = (i: number) => {
    const rows = pays.filter((_, k) => k !== i);
    const flags = payEdited.filter((_, k) => k !== i);
    const next = rebalance(amount, rows.map((x) => x.amount), flags);
    setPays(rows.map((x, k) => ({ ...x, amount: next[k]! })));
    setPayEdited(flags);
  };

  const changeKind = (next: TransactionKind) => {
    if (next === kind) return;
    setKind(next);
    setSplits([]);
    setCatMulti(false);
    setSplitEdited([]);
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
    if (catMulti) {
      const id = c?.id ?? null;
      const at = splits.findIndex((x) => x.category_id === id);
      const rows = at >= 0 ? splits.filter((_, k) => k !== at) : [...splits, { category_id: id, amount: 0 }];
      const flags = at >= 0 ? splitEdited.filter((_, k) => k !== at) : [...splitEdited, false];
      const next = rebalance(amount, rows.map((x) => x.amount), flags);
      setSplits(rows.map((x, k) => ({ ...x, amount: next[k]! })));
      setSplitEdited(flags);
      return;
    }
    setSplits(c ? [{ category_id: c.id, amount }] : []);
    setCategoryTouched(true);
    openPanel(pmTouched && (effectivePmId || pays.length) ? null : 'asset');
  };

  const pickAsset = (pm: PaymentMethod) => {
    if (payMulti) {
      const at = pays.findIndex((x) => x.payment_method_id === pm.id);
      const owner = pm.owner_member_id ?? viewingMember?.id ?? me.memberId;
      const rows = at >= 0 ? pays.filter((_, k) => k !== at) : [...pays, { payment_method_id: pm.id, member_id: owner, amount: 0 }];
      const flags = at >= 0 ? payEdited.filter((_, k) => k !== at) : [...payEdited, false];
      const next = rebalance(amount, rows.map((x) => x.amount), flags);
      setPays(rows.map((x, k) => ({ ...x, amount: next[k]! })));
      setPayEdited(flags);
      return;
    }
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

  /** 말로 넣기: "맥도날드 오천원 현대카드" → 제목·금액·자산을 채우고 빈 곳 입력판을 연다. */
  const applyVoice = (text: string) => {
    const r = parseSpokenEntry(text, data.paymentMethods);
    if (r.title) setTitle(r.title);
    if (r.amount) setAmountExpr(String(r.amount));
    const pm = r.paymentMethodId ? data.byId.paymentMethod.get(r.paymentMethodId) : undefined;
    if (pm && !payMulti) {
      setPaymentMethodId(pm.id);
      setPmTouched(true);
      setMemberId(pm.owner_member_id ?? viewingMember?.id ?? me.memberId);
    }
    haptic(10);
    openPanel(!r.amount ? 'amount' : kind === 'transfer' ? (pm ? null : 'asset') : 'category');
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
    const payRows = payMulti
      ? pays
          .filter((x) => x.amount > 0)
          .map((x) => ({ ...x, cash_date: computeCashDate(date, x.payment_method_id ? data.byId.paymentMethod.get(x.payment_method_id) : undefined) }))
      : [];
    const primary = payRows.length ? [...payRows].sort((a, b) => b.amount - a.amount)[0]! : null;
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
      cash_date: primary ? primary.cash_date : cashDate,
      merchant: title.trim() || null,
      memo: memo.trim() || null,
      payment_method_id: primary ? primary.payment_method_id : effectivePmId,
      member_id: primary ? primary.member_id : effectiveMemberId,
      installment_months: payRows.length > 1 ? 1 : primary ? 1 : isCredit ? installments : 1,
      splits: finalSplits,
      payments: payRows.length > 1 ? payRows : [],
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

  /** 반복을 켜고 저장하면 정기 지출 규칙도 만든다(이번 달은 지금 저장한 내역이 첫 번째). */
  const saveRepeat = (row: Transaction) => {
    if (!repeat.on || original) return;
    const date0 = toKstDate(row.occurred_at);
    void save('recurring_rules', {
      ...baseRow(me.householdId),
      template: {
        kind: row.kind,
        amount: row.amount,
        merchant: row.merchant,
        memo: row.memo,
        splits: row.splits,
        payment_method_id: row.payment_method_id,
        member_id: row.member_id,
        tag_ids: row.tag_ids,
        time: row.has_time ? toKstTime(row.occurred_at) : null,
      },
      day_of_month: Number(date0.slice(8, 10)),
      start_month: date0.slice(0, 7),
      times: repeat.times,
      last_generated_month: date0.slice(0, 7),
      paused: false,
      created_by: null,
    });
  };

  const submit = (close: () => void) => {
    if (!valid) return;
    const row = buildRow();
    persist(row);
    saveRepeat(row);
    close();
    if (original) askBulkRename(original, row);
  };

  /** 저장하고 바로 다음 입력. 날짜·자산·쓴 사람은 그대로 두고 나머지는 비운다. */
  const submitAndContinue = () => {
    if (!valid) return;
    const row = buildRow();
    persist(row);
    saveRepeat(row);
    setRepeat({ on: false, times: null });
    setSavedCount((n) => n + 1);
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 700);
    setTitle('');
    setAmountExpr('');
    setSplits([]);
    setCatMulti(false);
    setSplitEdited([]);
    if (payMulti) rebalanceAll(0);
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

  const lastLog = original ? data.activity.find((a) => a.tx_id === original.id) : undefined;
  const lastLogMember = lastLog?.member_id ? data.byId.member.get(lastLog.member_id) : null;
  const mergedChildren = original ? (data.mergedInto.get(original.id) ?? []) : [];
  const unmerge = (close: () => void) => {
    if (!original) return;
    const r = unmergeTransactions(original, mergedChildren, new Date().toISOString());
    for (const t of r.restored) void save('transactions', t);
    void save('transactions', r.removed);
    toast({ message: `${r.restored.length}건으로 다시 나눴어요` });
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
      amountTarget ? (
        <AmountPanel
          key={`${amountTarget.kind}-${amountTarget.index}`}
          label={`${amountTargetLabel()} 금액`}
          expr={rowExpr}
          onChange={setRowExpr}
          onDone={() => {
            const v = evalAmountExpression(rowExpr);
            if (v !== null) {
              if (amountTarget.kind === 'split') {
                const r = editAmount(amount, splits.map((x) => x.amount), splitEdited, amountTarget.index, v);
                setSplits(splits.map((x, k) => ({ ...x, amount: r.amounts[k]! })));
                setSplitEdited(r.edited);
              } else {
                const r = editAmount(amount, pays.map((x) => x.amount), payEdited, amountTarget.index, v);
                setPays(pays.map((x, k) => ({ ...x, amount: r.amounts[k]! })));
                setPayEdited(r.edited);
              }
            }
            const back = amountTarget.kind === 'split' ? 'category' : 'asset';
            setAmountTarget(null);
            openPanel(back);
          }}
          onClose={() => {
            setAmountTarget(null);
            openPanel(null);
          }}
        />
      ) : (
        <AmountPanel
          key="total"
          expr={amountExpr}
          onChange={setAmountExpr}
          onDone={() => {
            const v = evalAmountExpression(amountExpr);
            if (v !== null && hasOperator(amountExpr)) setAmountExpr(String(v));
            rebalanceAll(v ?? 0);
            afterAmount();
          }}
          onClose={() => openPanel(null)}
        />
      )
    ) : panel === 'category' ? (
      <CategoryPanel
        categories={categories}
        selectedIds={catMulti ? splits.map((x) => x.category_id) : [categoryId]}
        recommendedId={recommendedId}
        onPick={pickCategory}
        onAdd={() => setAdding('category')}
        multi={catMulti}
        onToggleMulti={toggleCatMulti}
        onClose={() => openPanel(null)}
      />
    ) : panel === 'asset' ? (
      <AssetPanel
        methods={data.paymentMethods}
        members={activeMembers}
        viewingMember={viewingMember}
        selectedIds={payMulti ? pays.map((x) => x.payment_method_id ?? '') : effectivePmId ? [effectivePmId] : []}
        onPick={pickAsset}
        multi={payMulti}
        onToggleMulti={kind === 'transfer' ? undefined : togglePayMulti}
        onNextMember={nextMember}
        onAdd={() => setAdding('asset')}
        onClose={() => openPanel(null)}
      />
    ) : null;

  function amountTargetLabel(): string {
    if (!amountTarget) return '';
    if (amountTarget.kind === 'split') {
      const id = splits[amountTarget.index]?.category_id;
      return id ? (data.byId.category.get(id)?.name ?? '분류') : '미분류';
    }
    const id = pays[amountTarget.index]?.payment_method_id;
    return id ? (data.byId.paymentMethod.get(id)?.name ?? '자산') : '자산';
  }

  const dateLabel = `${date.slice(2, 4)}. ${Number(date.slice(5, 7))}. ${Number(date.slice(8, 10))}. (${weekday(date)})`;
  const timeLabel = time ? `${Number(time.slice(0, 2)) < 12 ? '오전' : '오후'} ${((Number(time.slice(0, 2)) + 11) % 12) + 1}:${time.slice(3, 5)}` : '';

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
          <div className="flex h-12 items-center gap-1 px-2">
            <button type="button" aria-label="닫기" onClick={close} className="press flex size-11 items-center justify-center rounded-full">
              <ArrowLeft className="size-6" aria-hidden />
            </button>
            <h2 className="min-w-0 flex-1 truncate text-lg font-bold">
              {original ? `${KIND_LABEL[kind]} 고치기` : KIND_LABEL[kind]}
              {savedCount ? <span className="ml-2 text-sm font-medium text-muted">{savedCount}건 저장함</span> : null}
            </h2>
            {original ? (
              <button type="button" aria-label="이 내역의 기록" onClick={() => setLogOpen(true)} className="press flex size-11 items-center justify-center rounded-full text-muted">
                <History className="size-5" aria-hidden />
              </button>
            ) : null}
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
                <VoiceButton onText={applyVoice} />
              </>
            )}
          </div>
        )}
        footer={(close) => (
          <div className="flex gap-2">
            <Button block disabled={!valid} onClick={() => submit(close)}>
              {amount ? (
                <span>
                  <b className="tabular text-[17px] font-bold">{formatAmount(amount)}</b>원 저장
                </span>
              ) : (
                '저장'
              )}
            </Button>
            {!original ? (
              <Button variant="secondary" disabled={!valid} onClick={submitAndContinue} className="shrink-0 px-5">
                {justSaved ? <Check className="size-5 text-income" aria-label="저장함" /> : '계속'}
              </Button>
            ) : null}
          </div>
        )}
        overlay={panelNode}
      >
        {(close) => (
        <div className={`space-y-3 px-5 pt-1 ${panel ? 'pb-[46dvh]' : 'pb-6'}`} onClick={() => panel && openPanel(null)}>
          {/* 구분 */}
          {/* 한 덩어리 분할 버튼: 고른 쪽에만 흰 알약이 미끄러져 온다 */}
          <div className="relative grid h-10 grid-cols-3 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="구분">
            <span
              className={`absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-lg border-2 bg-surface shadow-sm transition-transform duration-200 ease-out ${KIND_STYLE[kind]}`}
              style={{ transform: `translateX(${KIND_ORDER.indexOf(kind) * 100}%)` }}
              aria-hidden
            />
            {KIND_ORDER.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={k === kind}
                onClick={() => changeKind(k)}
                className={`relative z-10 text-[15px] font-semibold transition-colors ${k === kind ? KIND_STYLE[k] : 'text-muted'}`}
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
                  <span className="text-base">{dateLabel}</span>
                  <input type="date" aria-label="날짜" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="absolute inset-0 opacity-0" />
                </label>
                <label className="relative min-w-16">
                  {timeLabel ? <span className="text-base">{timeLabel}</span> : <span className="text-xs font-normal text-muted/70">눌러서 시간 입력</span>}
                  <input type="time" aria-label="시각" value={time} onChange={(e) => setTime(e.target.value)} className="absolute inset-0 opacity-0" />
                </label>
              </div>
              <button
                type="button"
                onClick={() => setRepeatOpen(true)}
                className={`press ml-auto flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[13px] font-semibold ${repeat.on || (installments > 1 && isCredit && !payMulti) || sourceRule ? 'bg-brand-soft text-brand' : 'text-muted'}`}
              >
                {repeat.on || sourceRule ? <Repeat className="size-3.5" aria-hidden /> : null}
                {repeat.on ? `매달 ${Number(date.slice(8, 10))}일` : sourceRule ? '정기' : installments > 1 && isCredit && !payMulti ? `${installments}개월` : '반복/할부'}
              </button>
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
                className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted/50"
              />
              {title ? (
                <button type="button" aria-label="제목 지우기" onClick={() => setTitle('')} className="press -mr-1 rounded-full p-1 text-muted">
                  <X className="size-4" aria-hidden />
                </button>
              ) : null}
            </Row>
            {titleChoices.length ? (
              <div className="flex flex-wrap gap-1.5 py-1.5 pl-14" role="listbox" aria-label="예전 제목">
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
                      className="press flex h-8 max-w-full items-center gap-1.5 rounded-full bg-surface-2 px-3 text-sm"
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
              <span className={`tabular flex-1 text-[17px] font-bold ${amountExpr ? '' : 'text-muted/50'}`}>
                {amountExpr ? (hasOperator(amountExpr) ? formatAmountExpression(amountExpr) : `${formatAmount(amount)}원`) : '0원'}
              </span>
            </Row>

            {/* 4) 분류 */}
            {kind !== 'transfer' && catMulti ? (
              <MultiRows
                label="분류"
                active={panel === 'category'}
                onOpen={() => openPanel('category')}
                gap={splitGap}
                empty="분류를 고르세요"
                rows={splits.map((x, i) => {
                  const c = x.category_id ? data.byId.category.get(x.category_id) : null;
                  return {
                    key: x.category_id ?? 'none',
                    label: (
                      <>
                        <span aria-hidden>{c?.icon ?? '❔'}</span>
                        <span className="truncate">{c?.name ?? '미분류'}</span>
                      </>
                    ),
                    amount: x.amount,
                    editing: panel === 'amount' && amountTarget?.kind === 'split' && amountTarget.index === i,
                    onAmount: () => editRowAmount({ kind: 'split', index: i }),
                    onRemove: () => removeSplit(i),
                  };
                })}
              />
            ) : kind !== 'transfer' ? (
              <Row label="분류" active={panel === 'category'} onClick={() => openPanel('category')}>
                <span className={`flex flex-1 items-center gap-2 text-base ${category ? '' : 'text-muted/50'}`}>
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
              </Row>
            ) : null}

            {/* 5) 자산 */}
            {payMulti ? (
              <MultiRows
                label="자산"
                active={panel === 'asset'}
                onOpen={() => openPanel('asset')}
                gap={payGap}
                empty="자산을 고르세요"
                rows={pays.map((x, i) => {
                  const pm = x.payment_method_id ? data.byId.paymentMethod.get(x.payment_method_id) : undefined;
                  const who = x.member_id ? data.byId.member.get(x.member_id) : null;
                  const due = computeCashDate(date, pm);
                  return {
                    key: x.payment_method_id ?? String(i),
                    label: (
                      <>
                        {activeMembers.length > 1 && who ? <MemberBadge member={who} size="md" /> : null}
                        <span aria-hidden>{assetIcon(pm)}</span>
                        <span className="truncate">{pm?.name ?? '자산'}</span>
                        {due !== date ? <InfoTip text={`${shortDate(due)} 결제 예정`} label="결제 예정일" /> : null}
                      </>
                    ),
                    amount: x.amount,
                    editing: panel === 'amount' && amountTarget?.kind === 'pay' && amountTarget.index === i,
                    onAmount: () => editRowAmount({ kind: 'pay', index: i }),
                    onRemove: () => removePay(i),
                  };
                })}
              />
            ) : (
              <>
                <Row label={kind === 'transfer' ? '보낸 곳' : kind === 'income' ? '받은 곳' : '자산'} active={panel === 'asset'} onClick={() => openPanel('asset')}>
                  <span className={`flex min-w-0 flex-1 items-center gap-1.5 text-base ${paymentMethod ? '' : 'text-muted/50'}`}>
                    {activeMembers.length > 1 && member ? <MemberBadge member={member} size="md" /> : null}
                    {paymentMethod ? <span aria-hidden>{assetIcon(paymentMethod)}</span> : null}
                    <span className="truncate">{paymentMethod?.name ?? (original?.payment_label ? `‘${original.payment_label}’` : '선택')}</span>
                    {cashDate !== date ? (
                      <InfoTip text={`${shortDate(cashDate)} 결제 예정${isCredit && installments > 1 ? ` · ${installments}개월 나눠서` : ''}`} label="결제 예정일" />
                    ) : null}
                  </span>
                </Row>
              </>
            )}
          </div>

          {transferHint ? (
            <div className="flex items-center gap-3 rounded-xl bg-brand-soft px-4 py-3 text-sm">
              <ArrowLeftRight className="size-5 shrink-0 text-brand" aria-hidden />
              <p className="flex-1">‘{transferHint.label}’은(는) 이체(지출 아님) 대상입니다.</p>
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
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            onFocus={() => setPanel(null)}
            maxLength={500}
            enterKeyHint="enter"
            rows={Math.min(8, Math.max(1, memo.split('\n').length))}
            placeholder="메모"
            aria-label="메모"
            className="block w-full resize-none border-b border-line bg-transparent py-2.5 text-base leading-relaxed outline-none placeholder:text-muted/60 focus:border-brand"
          />

          {original && mergedChildren.length ? (
            <details className="rounded-xl bg-surface-2 px-4 py-3">
              <summary className="cursor-pointer text-[15px] font-semibold">합친 내역 {mergedChildren.length}건</summary>
              <ul className="mt-2 space-y-1.5 text-sm">
                {mergedChildren.map((t) => (
                  <li key={t.id} className="flex justify-between gap-2">
                    <span className="truncate">
                      {t.merchant ?? '이름 없음'} · {shortDate(toKstDate(t.occurred_at))}
                    </span>
                    <span className={`tabular shrink-0 ${t.status === 'canceled' || t.kind === 'transfer' ? 'text-muted line-through' : t.kind === 'income' ? 'text-income' : 'text-expense'}`}>
                      {t.kind === 'income' ? '+' : '−'}
                      {formatAmount(t.amount)}
                    </span>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => unmerge(close)} className="mt-3 text-sm font-semibold text-brand">
                병합 풀기 (원래대로 나누기)
              </button>
            </details>
          ) : null}

          {original && lastLog ? (
            <p className="flex items-center gap-1.5 text-xs font-normal text-muted">
              {lastLogMember ? <MemberBadge member={lastLogMember} /> : null}
              {ACTION_LABEL[lastLog.action]} · {whenLabel(lastLog.created_at)}
              {original.source !== 'manual' ? ' · 자동으로 들어온 내역' : ''}
            </p>
          ) : null}
          {original && !lastLog && original.source !== 'manual' ? (
            <p className="text-xs text-muted">
              자동으로 들어온 내역입니다{original.field_sources.user_edited ? ' · 직접 고침' : ''}
            </p>
          ) : null}
        </div>
        )}
      </Sheet>

      {logOpen && original ? <ActivityLogSheet txId={original.id} onClose={() => setLogOpen(false)} /> : null}
      {repeatOpen ? (
        <RepeatSheet
          day={Number(date.slice(8, 10))}
          repeat={repeat}
          onRepeat={setRepeat}
          canRepeat={!original}
          sourceRule={sourceRule}
          onStopRule={() => sourceRule && void save('recurring_rules', { ...sourceRule, paused: true })}
          installments={installments}
          onInstallments={setInstallments}
          installmentState={!isCredit ? 'not-credit' : payMulti ? 'multi' : 'ok'}
          onClose={() => setRepeatOpen(false)}
        />
      ) : null}
      {adding === 'category' ? <CategoryManagerSheet kind={categoryKind} onClose={() => setAdding(null)} /> : null}
      {adding === 'asset' ? <AssetManagerSheet defaultOwnerId={activeMembers.length > 1 ? (viewingMember?.id ?? null) : null} onClose={() => setAdding(null)} /> : null}
    </>
  );
}

interface MultiRow {
  key: string;
  label: ReactNode;
  amount: number;
  editing: boolean;
  onAmount: () => void;
  onRemove: () => void;
}

/** 다중선택 줄들: 왼쪽 라벨은 첫 줄에만, 줄마다 금액(누르면 숫자패드)과 ✕. */
function MultiRows({ label, rows, gap, active, empty, onOpen }: { label: string; rows: MultiRow[]; gap: number; active: boolean; empty: string; onOpen: () => void }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-10 w-11 shrink-0 items-center pt-0.5 text-sm font-normal text-muted">{label}</span>
      <div className={`min-w-0 flex-1 border-b py-0.5 transition-colors ${active ? 'border-brand' : 'border-line'}`}>
        {rows.length === 0 ? (
          <button type="button" onClick={onOpen} className="flex h-11 w-full items-center text-base text-muted/50">
            {empty}
          </button>
        ) : null}
        {rows.map((r, i) => (
          <div key={r.key}>
            <div className={`flex items-center gap-2 ${i === 0 ? 'min-h-10' : 'min-h-9'}`}>
              {/* 안에 ⓘ 버튼이 들어갈 수 있어 button 대신 div */}
              <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()} className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left text-base">
                {r.label}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  r.onAmount();
                }}
                aria-label="금액 고치기"
                className={`tabular h-7 shrink-0 rounded-lg px-2.5 text-right text-base font-semibold ${r.editing ? 'bg-brand-soft text-brand ring-1 ring-brand' : 'bg-surface-2'}`}
              >
                {formatAmount(r.amount)}원
              </button>
              <button type="button" aria-label="빼기" onClick={r.onRemove} className="press -mr-1 rounded-full p-1.5 text-muted">
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        ))}
        {gap !== 0 && rows.length > 0 ? (
          <p className="pb-1.5 text-xs font-semibold text-expense">{gap > 0 ? `남은 금액 ${formatAmount(gap)}원` : `${formatAmount(-gap)}원 넘음`}</p>
        ) : null}
      </div>
    </div>
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
      className={`flex min-h-11 items-center gap-3 ${onClick ? 'cursor-pointer' : ''}`}
    >
      <span className="w-11 shrink-0 text-sm font-normal text-muted">{label}</span>
      <div className={`flex min-h-11 min-w-0 flex-1 items-center border-b transition-colors ${active ? 'border-brand' : 'border-line'}`}>{children}</div>
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
