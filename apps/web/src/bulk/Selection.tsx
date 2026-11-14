import {
  applyRename,
  formatWon,
  mergeTransactions,
  PAYMENT_METHOD_TYPES,
  PAYMENT_METHOD_TYPE_LABEL,
  todayKst,
  toKstDate,
  type CategoryKind,
  type Transaction,
} from '@moayo/core';
import { ArrowLeft, Check, MoreVertical, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MemberBadge } from '../components/MemberBadge.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { useToast } from '../components/toastContext.ts';
import { Button } from '../components/ui.tsx';
import { useData } from '../data/dataContext.ts';
import { baseRow, newId, useMutations } from '../data/mutations.ts';
import { assetIcon } from '../lib/assets.ts';
import { haptic } from '../lib/flash.ts';
import { useCurrentHousehold } from '../lib/householdContext.ts';
import { SelectionContext, type SelectionApi } from './selectionContext.ts';
import { duplicate, withDate } from './txEdit.ts';

const MARK = 'moayoSelect';

/** 길게 눌러 여러 내역 고르기. 뒤로가기로 고르기를 끝낸다. */
export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const active = selected.size > 0;
  const pushed = useRef(false);

  const clear = useCallback(() => {
    setSelected(new Set());
    if (pushed.current) {
      pushed.current = false;
      if ((window.history.state as Record<string, unknown> | null)?.[MARK]) window.history.back();
    }
  }, []);

  const start = useCallback((id: string) => {
    setSelected((prev) => new Set(prev).add(id));
    if (!pushed.current) {
      pushed.current = true;
      window.history.pushState({ ...((window.history.state as object | null) ?? {}), [MARK]: 1 }, '');
    }
  }, []);

  const toggle = useCallback(
    (id: string) => {
      haptic(6);
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        if (next.size === 0 && pushed.current) {
          pushed.current = false;
          window.setTimeout(() => (window.history.state as Record<string, unknown> | null)?.[MARK] && window.history.back(), 0);
        }
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    const onPop = () => {
      if (pushed.current && !(window.history.state as Record<string, unknown> | null)?.[MARK]) {
        pushed.current = false;
        setSelected(new Set());
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const api = useMemo<SelectionApi>(() => ({ active, selected, start, toggle, clear }), [active, selected, start, toggle, clear]);
  return (
    <SelectionContext.Provider value={api}>
      {children}
      {active ? <SelectionBar api={api} /> : null}
    </SelectionContext.Provider>
  );
}

type Action = 'date' | 'category' | 'asset' | 'title' | 'tag' | 'copy' | 'merge' | 'delete';

const MENU: { key: Action; label: string }[] = [
  { key: 'date', label: '날짜 일괄수정' },
  { key: 'category', label: '분류 일괄수정' },
  { key: 'asset', label: '자산 일괄수정' },
  { key: 'title', label: '제목 일괄수정' },
  { key: 'tag', label: '태그 붙이기' },
  { key: 'copy', label: '복제' },
  { key: 'merge', label: '병합' },
];

function SelectionBar({ api }: { api: SelectionApi }) {
  const data = useData();
  const [menu, setMenu] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const txs = useMemo(() => data.transactions.filter((t) => api.selected.has(t.id)), [data.transactions, api.selected]);
  const counted = txs.filter((t) => t.status !== 'canceled');
  const income = counted.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = counted.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0);
  const net = income - expense;

  return createPortal(
    <>
      <div className="backdrop-in fixed inset-x-0 top-0 z-40 shadow-lg" role="toolbar" aria-label="고른 내역">
        <div className="pt-safe bg-fg text-bg">
          <div className="mx-auto flex h-12 max-w-3xl items-center gap-1 px-2">
            <button type="button" aria-label="고르기 끝" onClick={api.clear} className="press flex size-11 items-center justify-center rounded-full">
              <ArrowLeft className="size-6" aria-hidden />
            </button>
            <h2 className="flex-1 text-lg font-bold">수정</h2>
            <button type="button" aria-label="고른 내역 지우기" onClick={() => setAction('delete')} className="press flex size-11 items-center justify-center rounded-full">
              <Trash2 className="size-5" aria-hidden />
            </button>
            <button type="button" aria-label="더 보기" aria-expanded={menu} onClick={() => setMenu((m) => !m)} className="press flex size-11 items-center justify-center rounded-full">
              <MoreVertical className="size-5" aria-hidden />
            </button>
          </div>
          <div className="mx-auto flex max-w-3xl items-center justify-between bg-black/25 px-4 py-2 text-[15px]">
            <span>{txs.length}건이 선택되었습니다.</span>
            <span className="tabular font-semibold">{formatWon(Math.abs(net))}</span>
          </div>
        </div>
        <div className="grid grid-cols-3 border-b border-line bg-surface py-1.5 text-center">
          <Stat label="수입" value={income} tone="text-income" />
          <Stat label="지출" value={expense} tone="text-expense" />
          <Stat label="합계" value={net} tone="" />
        </div>
      </div>
      {menu ? (
        <div className="fixed inset-0 z-40" onClick={() => setMenu(false)}>
          <ul className="absolute right-2 top-[calc(env(safe-area-inset-top)+3rem)] w-52 overflow-hidden rounded-xl bg-surface py-1 shadow-2xl" role="menu">
            {MENU.map((m) => (
              <li key={m.key}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    setAction(m.key);
                  }}
                  className="flex h-12 w-full items-center px-4 text-left text-base active:bg-surface-2"
                >
                  {m.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {action ? <ActionSheet action={action} txs={txs} onClose={() => setAction(null)} onDone={api.clear} /> : null}
    </>,
    document.body,
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <p className="text-xs font-normal text-muted">{label}</p>
      <p className={`tabular text-[15px] font-semibold ${tone}`}>{value.toLocaleString('ko-KR')}</p>
    </div>
  );
}

const TITLE: Record<Action, string> = {
  date: '날짜 일괄수정',
  category: '분류 일괄수정',
  asset: '자산 일괄수정',
  title: '제목 일괄수정',
  tag: '태그 붙이기',
  copy: '복제',
  merge: '병합',
  delete: '지우기',
};

function ActionSheet({ action, txs, onClose, onDone }: { action: Action; txs: Transaction[]; onClose: () => void; onDone: () => void }) {
  const data = useData();
  const household = useCurrentHousehold();
  const { save, remove } = useMutations();
  const toast = useToast();
  const [date, setDate] = useState(() => (txs[0] ? toKstDate(txs[0].occurred_at) : todayKst()));
  const [title, setTitle] = useState(txs[0]?.merchant ?? '');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [owner, setOwner] = useState<string | 'all'>('all');

  /** 바꾼 내역을 저장하고, 되돌리기를 붙인 알림을 띄운 뒤 고르기를 끝낸다. */
  const commit = (next: Transaction[], message: string, close: () => void, undo?: () => void) => {
    haptic(12);
    const before = new Map(txs.map((t) => [t.id, t]));
    for (const t of next) void save('transactions', t);
    close();
    onDone();
    toast({
      message,
      action: {
        label: '되돌리기',
        onClick:
          undo ??
          (() => {
            for (const t of next) {
              const b = before.get(t.id);
              if (b) void save('transactions', b);
            }
          }),
      },
    });
  };

  const kinds = new Set(txs.map((t) => t.kind));
  const catKind: CategoryKind = kinds.has('expense') || !kinds.has('income') ? 'expense' : 'income';
  const merge = action === 'merge' ? mergeTransactions(txs, newId(), new Date().toISOString()) : null;
  const people = data.members.filter((m) => !m.deleted_at);

  const body = (close: () => void): ReactNode => {
    switch (action) {
      case 'date':
        return (
          <Form onSubmit={() => commit(txs.map((t) => withDate(t, date, data.byId.paymentMethod)), `${txs.length}건 날짜를 바꿨어요`, close)} submit="적용">
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="날짜" className="h-12 w-full rounded-xl border border-line bg-surface px-4 text-base" />
          </Form>
        );
      case 'title':
        return (
          <Form onSubmit={() => commit(txs.map((t) => ({ ...t, merchant: title.trim() || null })), `${txs.length}건 제목을 바꿨어요`, close)} submit="적용">
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} aria-label="제목" className="h-12 w-full border-b-2 border-line bg-transparent text-lg outline-none focus:border-brand" />
          </Form>
        );
      case 'category': {
        const cats = data.categories.filter((c) => c.kind === catKind && !c.archived);
        const pick = (id: string | null) => {
          const next = txs
            .filter((t) => t.kind === catKind)
            .map((t) => applyRename(t, { categoryId: id }, data.byId.paymentMethod));
          commit(next, `${next.length}건 분류를 바꿨어요`, close);
        };
        return (
          <>
            {kinds.size > 1 ? <p className="mb-2 text-sm font-normal text-muted">{catKind === 'expense' ? '지출' : '수입'} 내역에만 적용됩니다.</p> : null}
            <div className="-mx-5 grid grid-cols-4 gap-px bg-line">
              {cats.map((c) => (
                <button key={c.id} type="button" onClick={() => pick(c.id)} className="flex h-16 flex-col items-center justify-center gap-0.5 bg-surface text-[13px] active:bg-surface-2">
                  {c.icon ? <span className="text-xl leading-none">{c.icon}</span> : null}
                  <span className="line-clamp-1">{c.name}</span>
                </button>
              ))}
              <button type="button" onClick={() => pick(null)} className="flex h-16 flex-col items-center justify-center bg-surface text-[13px] text-muted">
                미분류
              </button>
            </div>
          </>
        );
      }
      case 'asset': {
        const list = data.paymentMethods.filter((p) => !p.archived && (owner === 'all' || !p.owner_member_id || p.owner_member_id === owner));
        const pick = (id: string) => commit(txs.map((t) => applyRename(t, { paymentMethodId: id }, data.byId.paymentMethod)), `${txs.length}건 자산을 바꿨어요`, close);
        return (
          <>
            {people.length > 1 ? (
              <div className="mb-2 flex gap-1.5">
                {[{ id: 'all', node: '모두' as ReactNode }, ...people.map((m) => ({ id: m.id, node: <MemberBadge member={m} size="md" /> as ReactNode }))].map((o) => (
                  <button key={o.id} type="button" onClick={() => setOwner(o.id)} className={`h-8 rounded-full px-3 text-sm font-semibold ${owner === o.id ? 'bg-fg text-bg' : 'bg-surface-2 text-muted'}`}>
                    {o.node}
                  </button>
                ))}
              </div>
            ) : null}
            {PAYMENT_METHOD_TYPES.map((type) => {
              const items = list.filter((p) => p.type === type);
              if (!items.length) return null;
              return (
                <div key={type} className="-mx-5">
                  <p className="bg-surface-2 px-5 py-1.5 text-xs font-normal text-muted">{PAYMENT_METHOD_TYPE_LABEL[type]}</p>
                  {items.map((p) => {
                    const o = p.owner_member_id ? data.byId.member.get(p.owner_member_id) : null;
                    return (
                      <button key={p.id} type="button" onClick={() => pick(p.id)} className="flex h-12 w-full items-center gap-1.5 border-b border-line px-5 text-left text-base active:bg-surface-2">
                        {people.length > 1 && o ? <MemberBadge member={o} size="md" /> : null}
                        <span aria-hidden>{assetIcon(p)}</span>
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </>
        );
      }
      case 'tag': {
        const add = () => {
          const name = newTag.trim().replace(/^#/, '');
          if (!name) return;
          const existing = data.tags.find((t) => t.name === name);
          const tag = existing ?? { ...baseRow(household.householdId), name };
          if (!existing) void save('tags', tag);
          setTagIds((ids) => (ids.includes(tag.id) ? ids : [...ids, tag.id]));
          setNewTag('');
        };
        return (
          <Form
            onSubmit={() => commit(txs.map((t) => ({ ...t, tag_ids: [...new Set([...t.tag_ids, ...tagIds])] })), `${txs.length}건에 태그를 붙였어요`, close)}
            submit="붙이기"
            disabled={!tagIds.length}
          >
            <div className="flex flex-wrap gap-2">
              {data.tags.map((t) => {
                const on = tagIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTagIds((ids) => (on ? ids.filter((x) => x !== t.id) : [...ids, t.id]))}
                    className={`flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold ${on ? 'bg-brand text-brand-fg' : 'bg-surface-2 text-muted'}`}
                  >
                    {on ? <Check className="size-4" aria-hidden /> : null}#{t.name}
                  </button>
                );
              })}
              <input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    add();
                  }
                }}
                onBlur={add}
                placeholder="+ 새 태그"
                aria-label="새 태그"
                className="h-9 w-28 rounded-full bg-surface-2 px-3 text-sm outline-none"
              />
            </div>
          </Form>
        );
      }
      case 'copy': {
        const run = (d: string) => {
          const copies = txs.map((t) => duplicate(t, d, data.byId.paymentMethod));
          commit(copies, `${copies.length}건 복제했어요`, close, () => {
            for (const c of copies) void remove('transactions', c);
          });
        };
        return (
          <div className="space-y-3 pb-2">
            <Button block onClick={() => run(todayKst())}>
              오늘로 복제
            </Button>
            <div className="flex gap-2">
              <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="복제할 날짜" className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 text-base" />
              <Button variant="secondary" onClick={() => run(date)} className="shrink-0">
                이 날로
              </Button>
            </div>
          </div>
        );
      }
      case 'merge': {
        if (!merge || !merge.ok) return <p className="pb-4 text-[15px]">{merge && !merge.ok ? merge.reason : ''}</p>;
        const m = merge.merged;
        return (
          <div className="space-y-4 pb-2">
            <div className="rounded-xl bg-surface-2 p-4">
              <p className="text-sm font-normal text-muted">합친 결과</p>
              <p className="mt-1 text-lg font-bold">
                {m.merchant ?? '이름 없음'} · <span className={m.kind === 'income' ? 'text-income' : 'text-expense'}>{m.kind === 'income' ? '수입' : '지출'} {formatWon(m.amount)}</span>
              </p>
              <p className="mt-2 whitespace-pre-line text-sm font-normal text-muted">{m.memo?.split('\n').at(-1)}</p>
            </div>
            <Button
              block
              onClick={() => {
                haptic(15);
                void save('transactions', m);
                for (const t of merge.originals) void save('transactions', t);
                close();
                onDone();
                toast({
                  message: `${txs.length}건을 한 건으로 합쳤어요`,
                  action: {
                    label: '되돌리기',
                    onClick: () => {
                      void remove('transactions', m);
                      for (const t of txs) void save('transactions', t);
                    },
                  },
                });
              }}
            >
              합치기
            </Button>
          </div>
        );
      }
      case 'delete':
        return (
          <div className="space-y-3 pb-2">
            <p className="text-[15px]">고른 {txs.length}건을 지울까요?</p>
            <Button
              block
              className="bg-expense text-white"
              onClick={() => {
                haptic(15);
                for (const t of txs) void remove('transactions', t);
                close();
                onDone();
                toast({ message: `${txs.length}건 지웠어요`, action: { label: '되돌리기', onClick: () => txs.forEach((t) => void save('transactions', { ...t, deleted_at: null })) } });
              }}
            >
              지우기
            </Button>
          </div>
        );
    }
  };

  return (
    <Sheet title={`${TITLE[action]} · ${txs.length}건`} onClose={onClose}>
      {(close) => body(close)}
    </Sheet>
  );
}

function Form({ onSubmit, submit, disabled, children }: { onSubmit: () => void; submit: string; disabled?: boolean; children: ReactNode }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled) onSubmit();
      }}
      className="space-y-4 pb-2 pt-1"
    >
      {children}
      <Button type="submit" block disabled={disabled}>
        {submit}
      </Button>
    </form>
  );
}
