import { formatAmount, splitIconName, todayKst, type Transaction, type TransactionKind } from '@moayo/core';
import { ArrowLeftRight, CircleAlert, Copy, Image as ImageIcon, Layers, Scissors, Trash2 } from 'lucide-react';
import { useSelection } from '../bulk/selectionContext.ts';
import { duplicate } from '../bulk/txEdit.ts';
import { useMutations } from '../data/mutations.ts';
import { collapse, play } from '../lib/motion.ts';
import { useRowGestures } from '../lib/useRowGestures.ts';
import { useEffect, useRef } from 'react';
import { useToast } from './toastContext.ts';
import { useData } from '../data/dataContext.ts';
import { useOpenEditor } from '../editor/editorContext.ts';
import { useIsFlashing } from '../lib/flash.ts';
import { KIND_LABEL } from '../lib/format.ts';

/** 편한가계부처럼 부호 없이 색으로: 지출 빨강, 수입 파랑, 이체 회색. */
const AMOUNT_TONE: Record<TransactionKind, string> = { expense: 'text-expense', income: 'text-income', transfer: 'text-transfer' };
import { EmojiCircle } from './bits.tsx';

/** 내역 한 줄. amount 를 주면 그 금액을 보여 준다(할부 조각 등). */
export function TxRow({ tx, amount }: { tx: Transaction; amount?: number }) {
  const data = useData();
  const openEditor = useOpenEditor();
  const flashing = useIsFlashing(tx.id);
  const selection = useSelection();
  const { save, remove } = useMutations();
  const toast = useToast();
  const selected = selection.selected.has(tx.id);
  const rowRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  // 고르는 순간 '통' 하고 살짝 눌렸다 튄다.
  const wasSelected = useRef(selected);
  useEffect(() => {
    if (selected && !wasSelected.current) {
      void play(btnRef.current, [{ transform: 'scale(1)' }, { transform: 'scale(0.96)', offset: 0.3 }, { transform: 'scale(1.015)', offset: 0.7 }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
    }
    wasSelected.current = selected;
  }, [selected]);
  const mergedCount = data.mergedInto.get(tx.id)?.length ?? 0;
  const { dx, handlers, consumeClick } = useRowGestures({
    swipe: !selection.active,
    onLongPress: () => (selection.active ? selection.toggle(tx.id) : selection.start(tx.id)),
    onSwipeLeft: () => {
      // 줄이 납작하게 접히며 사라진 뒤 지운다.
      void collapse(rowRef.current).then(() => remove('transactions', tx));
      toast({ message: `‘${tx.merchant ?? '내역'}’ 지웠어요`, action: { label: '되돌리기', onClick: () => void save('transactions', { ...tx, deleted_at: null }) } });
    },
    onSwipeRight: () => {
      const copy = duplicate(tx, todayKst(), data.byId.paymentMethod);
      void save('transactions', copy);
      toast({ message: '오늘 날짜로 복제했어요', action: { label: '되돌리기', onClick: () => void remove('transactions', copy) } });
    },
  });
  const firstCat = tx.splits[0]?.category_id ? data.byId.category.get(tx.splits[0].category_id) : null;
  const split = tx.splits.length > 1;
  // 제목 앞 이모지(🍔맥도날드)는 원형 아이콘으로 쓰고 제목 글자에서는 뺀다.
  const titleParts = splitIconName(tx.merchant ?? '');
  const title = (titleParts.icon ? titleParts.name : tx.merchant) || (tx.kind === 'transfer' ? '이체' : (firstCat?.name ?? '미분류'));
  // 둘째 줄: '💙 네이버 현대카드' — 낸 사람 이모지 + 자산 이름(여러 자산이면 · 로 이어서).
  const showWho = data.members.filter((m) => !m.deleted_at).length > 1;
  const pays = (tx.payments?.length ?? 0) > 1 ? tx.payments! : [{ payment_method_id: tx.payment_method_id, member_id: tx.member_id }];
  const payText = pays
    .map((p) => {
      const pm = p.payment_method_id ? data.byId.paymentMethod.get(p.payment_method_id) : null;
      // 입력 화면과 같게: 자산 주인 → 기록된 사람.
      const whoId = pm?.owner_member_id ?? p.member_id;
      const who = whoId ? data.byId.member.get(whoId) : null;
      const name = pm?.name ?? (pays.length === 1 ? tx.payment_label : null);
      return name ? [showWho ? who?.emoji : null, name].filter(Boolean).join(' ') : '';
    })
    .filter(Boolean)
    .join(' · ');
  const subText = [payText, tx.installment_months > 1 ? `${tx.installment_months}개월` : null].filter(Boolean).join(' · ');

  return (
    <div ref={rowRef} data-tx-id={tx.id} className="relative -mx-2 overflow-hidden">
      {dx !== 0 ? (
        <div className={`absolute inset-0 flex items-center px-5 text-sm font-semibold text-white ${dx > 0 ? 'justify-start bg-income' : 'justify-end bg-expense'}`} aria-hidden>
          {dx > 0 ? <Copy className="mr-1.5 size-4" /> : null}
          {dx > 0 ? '오늘로 복제' : '삭제'}
          {dx < 0 ? <Trash2 className="ml-1.5 size-4" /> : null}
        </div>
      ) : null}
    <button
      ref={btnRef}
      type="button"
      {...handlers}
      onClick={() => {
        if (consumeClick()) return;
        if (selection.active) selection.toggle(tx.id);
        else openEditor({ tx });
      }}
      aria-pressed={selection.active ? selected : undefined}
      style={dx ? { transform: `translateX(${dx}px)` } : undefined}
      className={`relative flex w-full touch-pan-y select-none items-center gap-3 px-2 py-1.5 text-left transition-[background-color] ${dx ? '' : 'transition-transform'} ${
        selected ? 'bg-brand-soft' : 'bg-surface active:bg-surface-2'
      } ${flashing ? 'row-flash' : ''}`}
    >
      {tx.kind === 'transfer' && !titleParts.icon ? (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-transfer" aria-hidden>
          <ArrowLeftRight className="size-5" />
        </span>
      ) : (
        <EmojiCircle emoji={titleParts.icon ?? firstCat?.icon ?? null} fallbackColor={firstCat?.color} />
      )}
      {selected ? (
        <span className="check-pop absolute left-8 top-1 flex size-[18px] items-center justify-center rounded-full bg-brand text-brand-fg ring-2 ring-surface" aria-hidden>
          <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-semibold">{title}</span>
          {split ? <Scissors className="size-3.5 shrink-0 text-muted" aria-label="나눠서 기록" /> : null}
          {mergedCount ? <Layers className="size-3.5 shrink-0 text-muted" aria-label={`${mergedCount + 0}건 합친 내역`} /> : null}
          {tx.attachments?.length ? <ImageIcon className="size-3.5 shrink-0 text-muted" aria-label={`사진 ${tx.attachments.length}장`} /> : null}
          {tx.status === 'review' ? <CircleAlert className="size-4 shrink-0 text-expense" aria-label="확인 필요" /> : null}
        </span>
        {subText ? <span className="block truncate text-[13px] font-normal text-muted">{subText}</span> : null}
      </span>
      <span
        className={`tabular shrink-0 text-right text-[15px] font-semibold ${AMOUNT_TONE[tx.kind]} ${tx.status === 'canceled' ? 'line-through opacity-50' : ''}`}
        aria-label={`${KIND_LABEL[tx.kind]} ${formatAmount(amount ?? tx.amount)}원`}
      >
        {formatAmount(amount ?? tx.amount)}원
      </span>
    </button>
    </div>
  );
}
