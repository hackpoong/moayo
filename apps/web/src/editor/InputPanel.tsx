import {
  evalAmountExpression,
  formatAmount,
  hasOperator,
  PAYMENT_METHOD_TYPE_LABEL,
  type Category,
  type Member,
  type PaymentMethod,
  type PaymentMethodType,
} from '@moayo/core';
import { ArrowLeftRight, ChevronDown, Delete, Pencil, Scissors, Sparkles } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { MemberBadge } from '../components/MemberBadge.tsx';
import { haptic } from '../lib/flash.ts';

export type PanelKind = 'amount' | 'category' | 'asset';

/**
 * 패널이 막 바뀐 직후의 누름은 무시한다.
 * 앞 패널(숫자패드 '완료' 등)을 누른 손가락의 click 이 새 패널 칸에 떨어지는 것을 막는다.
 */
function useFreshGuard(ms = 350) {
  const openedAt = useRef(0);
  useEffect(() => {
    openedAt.current = performance.now();
  }, []);
  return () => performance.now() - openedAt.current < ms;
}

/** 휴대폰 키보드 자리에 뜨는 앱 입력판. 위 막대 + 내용. */
function PanelFrame({ title, actions, onClose, children }: { title: ReactNode; actions?: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <div className="panel-in pb-safe absolute inset-x-0 bottom-0 z-10 flex flex-col bg-surface shadow-[0_-8px_24px_rgba(0,0,0,0.12)]" onClick={(e) => e.stopPropagation()}>
      <div className="flex h-12 shrink-0 items-center gap-1 bg-fg pl-4 pr-1 text-bg">
        <div className="min-w-0 flex-1 truncate text-[15px] font-semibold">{title}</div>
        {actions}
        <button type="button" aria-label="입력판 닫기" onClick={onClose} className="press flex size-11 items-center justify-center rounded-full">
          <ChevronDown className="size-6" aria-hidden />
        </button>
      </div>
      <div className="max-h-[40dvh] min-h-[16rem] overflow-y-auto overscroll-contain">{children}</div>
    </div>
  );
}

export function BarButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="press flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium">
      {children}
    </button>
  );
}

// ── 금액 ───────────────────────────────────────────────────────────────────
const KEYS = [['1', '2', '3', 'del'], ['4', '5', '6', '-'], ['7', '8', '9', '+'], ['00', '0', '000', 'done']] as const;

export function AmountPanel({ expr, onChange, onDone, onClose }: { expr: string; onChange: (e: string) => void; onDone: () => void; onClose: () => void }) {
  const press = (key: string) => {
    haptic(6);
    if (key === 'del') return onChange(expr.slice(0, -1));
    if (key === 'done') return onDone();
    if (key === '+' || key === '-') {
      if (!expr) return;
      return onChange(/[+-]$/.test(expr) ? expr.slice(0, -1) + key : expr + key);
    }
    const lastNumber = expr.split(/[+-]/).pop() ?? '';
    if (lastNumber === '' && (key === '0' || key === '00' || key === '000')) return; // 앞자리 0 막기
    if (lastNumber.length + key.length > 11) return;
    onChange(expr + key);
  };
  const preview = hasOperator(expr) ? evalAmountExpression(expr) : null;

  return (
    <PanelFrame title={preview !== null ? `금액 = ${formatAmount(preview)}원` : '금액'} onClose={onClose}>
      <div className="grid grid-cols-4 gap-px bg-line">
        {KEYS.flat().map((k) => (
          <button
            key={k}
            type="button"
            onPointerDown={(e) => {
              if (k === 'done') return;
              e.preventDefault();
              press(k);
            }}
            onClick={() => k === 'done' && press(k)}
            aria-label={k === 'del' ? '지우기' : k === 'done' ? '완료' : k}
            className={`flex h-[3.6rem] select-none items-center justify-center text-2xl font-medium active:brightness-90 ${
              k === 'done' ? 'bg-brand text-lg font-semibold text-brand-fg' : 'bg-surface active:bg-surface-2'
            }`}
          >
            {k === 'del' ? <Delete className="size-6" aria-hidden /> : k === 'done' ? '완료' : k === '-' ? '−' : k}
          </button>
        ))}
      </div>
    </PanelFrame>
  );
}

// ── 분류 ───────────────────────────────────────────────────────────────────
export function CategoryPanel({
  categories,
  selectedId,
  recommendedId,
  onPick,
  onAdd,
  onSplit,
  onClose,
}: {
  categories: Category[];
  selectedId: string | null;
  recommendedId: string | null;
  onPick: (c: Category | null) => void;
  onAdd: () => void;
  onSplit: () => void;
  onClose: () => void;
}) {
  const isFresh = useFreshGuard();
  return (
    <PanelFrame
      title="분류"
      onClose={onClose}
      actions={
        <>
          <BarButton label="여러 분류로 나누기" onClick={onSplit}>
            <Scissors className="size-4" aria-hidden />
            나누기
          </BarButton>
          <BarButton label="분류 추가" onClick={onAdd}>
            <Pencil className="size-5" aria-hidden />
          </BarButton>
        </>
      }
    >
      <div className="grid grid-cols-4 gap-px bg-line">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              if (isFresh()) return;
              haptic(6);
              onPick(c);
            }}
            className={`relative flex h-[4.25rem] flex-col items-center justify-center gap-0.5 px-1 text-[13px] active:brightness-95 ${c.id === selectedId ? 'bg-brand-soft font-semibold text-brand' : 'bg-surface'}`}
          >
            {c.id === recommendedId ? <Sparkles className="absolute right-1.5 top-1.5 size-3.5 text-brand" aria-label="추천" /> : null}
            <span className="text-xl leading-none" aria-hidden>
              {c.icon ?? '•'}
            </span>
            <span className="line-clamp-1">{c.name}</span>
          </button>
        ))}
        <button type="button" onClick={() => !isFresh() && onPick(null)} className={`flex h-[4.25rem] flex-col items-center justify-center gap-0.5 text-[13px] ${selectedId === null ? 'bg-brand-soft font-semibold text-brand' : 'bg-surface text-muted'}`}>
          <span className="text-xl leading-none" aria-hidden>
            ❔
          </span>
          미분류
        </button>
      </div>
    </PanelFrame>
  );
}

// ── 자산 ───────────────────────────────────────────────────────────────────
const TYPE_ORDER: PaymentMethodType[] = ['cash', 'bank_account', 'check_card', 'credit_card', 'local_currency', 'gift_voucher', 'easy_pay'];

export function AssetPanel({
  methods,
  members,
  viewingMember,
  selectedId,
  onPick,
  onNextMember,
  nextMember,
  onAdd,
  onClose,
}: {
  methods: PaymentMethod[];
  members: Member[];
  viewingMember: Member | null;
  selectedId: string | null;
  onPick: (pm: PaymentMethod) => void;
  onNextMember: () => void;
  /** 바꾸기를 누르면 보게 될 사람. */
  nextMember?: Member | null;
  onAdd: () => void;
  onClose: () => void;
}) {
  // 지금 보고 있는 사람의 자산 + 주인이 없는(같이 쓰는) 자산.
  const isFresh = useFreshGuard();
  const visible = methods.filter((m) => !m.archived && (!m.owner_member_id || m.owner_member_id === viewingMember?.id || members.length < 2));
  const groups = TYPE_ORDER.map((t) => ({ type: t, items: visible.filter((m) => m.type === t) })).filter((g) => g.items.length);

  return (
    <PanelFrame
      title={
        members.length > 1 && viewingMember ? (
          <span className="flex items-center gap-2">
            <span className="rounded-full bg-bg/15 px-2 py-0.5">
              <MemberBadge member={viewingMember} size="md" />
            </span>
            의 자산
          </span>
        ) : (
          '자산'
        )
      }
      onClose={onClose}
      actions={
        <>
          {members.length > 1 ? (
            <BarButton label="다른 사람 자산 보기" onClick={onNextMember}>
              <ArrowLeftRight className="size-4" aria-hidden />
              {nextMember ? `${nextMember.emoji ?? ''}${nextMember.display_name}` : '바꾸기'}
            </BarButton>
          ) : null}
          <BarButton label="자산 추가" onClick={onAdd}>
            <Pencil className="size-5" aria-hidden />
          </BarButton>
        </>
      }
    >
      {groups.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">
          {viewingMember?.display_name ?? ''} 자산이 없습니다. 위 연필 버튼으로 추가하세요.
        </p>
      ) : (
        groups.map((g) => (
          <div key={g.type}>
            <p className="bg-surface-2 px-4 py-1.5 text-xs font-medium text-muted">{PAYMENT_METHOD_TYPE_LABEL[g.type]}</p>
            <div className="grid grid-cols-3 gap-px bg-line">
              {g.items.map((pm) => (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => {
                    if (isFresh()) return;
                    haptic(6);
                    onPick(pm);
                  }}
                  className={`flex h-14 items-center justify-center px-2 text-center text-[14px] leading-tight active:brightness-95 ${pm.id === selectedId ? 'bg-brand-soft font-semibold text-brand' : 'bg-surface'}`}
                >
                  <span className="line-clamp-2">{pm.name}</span>
                </button>
              ))}
              {Array.from({ length: (3 - (g.items.length % 3)) % 3 }, (_, i) => (
                <span key={`pad-${i}`} className="bg-surface" />
              ))}
            </div>
          </div>
        ))
      )}
    </PanelFrame>
  );
}
