import { todayKst, toKstTime, type Transaction } from '@moayo/core';
import { ArrowLeftRight, CircleAlert, Copy, Layers, Scissors, Trash2 } from 'lucide-react';
import { useSelection } from '../bulk/selectionContext.ts';
import { duplicate } from '../bulk/txEdit.ts';
import { useMutations } from '../data/mutations.ts';
import { useRowGestures } from '../lib/useRowGestures.ts';
import { useToast } from './toastContext.ts';
import { useData } from '../data/dataContext.ts';
import { useOpenEditor } from '../editor/editorContext.ts';
import { useIsFlashing } from '../lib/flash.ts';
import { KIND_TEXT, signedAmount } from '../lib/format.ts';
import { MemberBadge } from './MemberBadge.tsx';
import { CategoryIcon } from './bits.tsx';

/** 내역 한 줄. amount 를 주면 그 금액을 보여 준다(할부 조각 등). */
export function TxRow({ tx, amount }: { tx: Transaction; amount?: number }) {
  const data = useData();
  const openEditor = useOpenEditor();
  const flashing = useIsFlashing(tx.id);
  const selection = useSelection();
  const { save, remove } = useMutations();
  const toast = useToast();
  const selected = selection.selected.has(tx.id);
  const mergedCount = data.mergedInto.get(tx.id)?.length ?? 0;
  const { dx, handlers, consumeClick } = useRowGestures({
    swipe: !selection.active,
    onLongPress: () => (selection.active ? selection.toggle(tx.id) : selection.start(tx.id)),
    onSwipeLeft: () => {
      void remove('transactions', tx);
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
  const title = tx.merchant || (tx.kind === 'transfer' ? '이체' : (firstCat?.name ?? '미분류'));
  const pm = tx.payment_method_id ? data.byId.paymentMethod.get(tx.payment_method_id) : null;
  const multiPay = (tx.payments?.length ?? 0) > 1;
  const payers = multiPay
    ? [...new Set(tx.payments!.map((p) => p.member_id))].map((id) => (id ? data.byId.member.get(id) : undefined)).filter((m) => !!m)
    : [tx.member_id ? data.byId.member.get(tx.member_id) : undefined].filter((m) => !!m);
  const sub = [
    tx.merchant && tx.kind !== 'transfer' ? (split ? `${firstCat?.name ?? '미분류'} 외 ${tx.splits.length - 1}` : (firstCat?.name ?? '미분류')) : null,
    pm ? (multiPay ? `${pm.name} 외 ${tx.payments!.length - 1}` : pm.name) : null,
    tx.installment_months > 1 ? `${tx.installment_months}개월` : null,
    tx.has_time ? toKstTime(tx.occurred_at) : null,
  ].filter(Boolean);

  return (
    <div className="relative -mx-2 overflow-hidden rounded-xl">
      {dx !== 0 ? (
        <div className={`absolute inset-0 flex items-center px-5 text-sm font-semibold text-white ${dx > 0 ? 'justify-start bg-income' : 'justify-end bg-expense'}`} aria-hidden>
          {dx > 0 ? <Copy className="mr-1.5 size-4" /> : null}
          {dx > 0 ? '오늘로 복제' : '삭제'}
          {dx < 0 ? <Trash2 className="ml-1.5 size-4" /> : null}
        </div>
      ) : null}
    <button
      type="button"
      {...handlers}
      onClick={() => {
        if (consumeClick()) return;
        if (selection.active) selection.toggle(tx.id);
        else openEditor({ tx });
      }}
      aria-pressed={selection.active ? selected : undefined}
      style={dx ? { transform: `translateX(${dx}px)` } : undefined}
      className={`relative flex w-full touch-pan-y select-none items-center gap-3 px-2 py-2 text-left transition-[background-color] ${dx ? '' : 'transition-transform'} ${
        selected ? 'bg-brand-soft' : 'bg-surface active:bg-surface-2'
      } ${flashing ? 'row-flash' : ''}`}
    >
      {tx.kind === 'transfer' ? (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-transfer" aria-hidden>
          <ArrowLeftRight className="size-5" />
        </span>
      ) : (
        <CategoryIcon category={firstCat} />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-semibold">{title}</span>
          {split ? <Scissors className="size-3.5 shrink-0 text-muted" aria-label="나눠서 기록" /> : null}
          {mergedCount ? <Layers className="size-3.5 shrink-0 text-muted" aria-label={`${mergedCount + 0}건 합친 내역`} /> : null}
          {tx.status === 'review' ? <CircleAlert className="size-4 shrink-0 text-expense" aria-label="확인 필요" /> : null}
        </span>
        <span className="flex items-center gap-1.5 text-[13px] font-normal text-muted">
          {data.members.length > 1 ? payers.map((m) => <MemberBadge key={m.id} member={m} />) : null}
          <span className="truncate">{sub.join(' · ')}</span>
        </span>
      </span>
      <span className={`tabular shrink-0 text-right font-semibold ${KIND_TEXT[tx.kind]} ${tx.status === 'canceled' ? 'line-through opacity-50' : ''}`}>
        {signedAmount(tx.kind, amount ?? tx.amount)}
      </span>
    </button>
    </div>
  );
}
