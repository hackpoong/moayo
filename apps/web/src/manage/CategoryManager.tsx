import { joinIconName, splitIconName, type Category, type CategoryKind } from '@moayo/core';
import { ArrowLeft, MinusCircle, Pencil, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { Sheet } from '../components/Sheet.tsx';
import { SortableList } from '../components/SortableList.tsx';
import { useToast } from '../components/toastContext.ts';
import { Button } from '../components/ui.tsx';
import { useData } from '../data/dataContext.ts';
import { baseRow, useMutations } from '../data/mutations.ts';
import { CATEGORY_COLORS } from '../lib/categoryStyle.ts';
import { useCurrentHousehold } from '../lib/householdContext.ts';

const KIND_TITLE: Record<CategoryKind, string> = { expense: '지출분류', income: '수입분류' };

/** 분류 목록: ⊖ 지우기 · 이모지+이름 · ✏ 고치기 · ≡ 끌어서 순서. */
export function CategoryList({ kind, onEdit }: { kind: CategoryKind; onEdit: (c: Category) => void }) {
  const data = useData();
  const { save } = useMutations();
  const toast = useToast();
  const list = data.categories.filter((c) => c.kind === kind && !c.archived);

  const reorder = (ids: string[]) => {
    ids.forEach((id, i) => {
      const c = data.byId.category.get(id);
      if (c && c.sort !== i) void save('categories', { ...c, sort: i });
    });
  };
  const archive = (c: Category) => {
    if (!window.confirm(`‘${c.name}’ 분류를 지울까요?\n이미 기록한 내역의 분류는 그대로 남습니다.`)) return;
    void save('categories', { ...c, archived: true });
    toast({ message: `‘${c.name}’을 지웠어요`, action: { label: '되돌리기', onClick: () => void save('categories', { ...c, archived: false }) } });
  };

  if (list.length === 0) return <p className="px-5 py-10 text-center text-sm text-muted">분류가 없습니다. 위의 + 로 추가하세요.</p>;
  return (
    <SortableList
      items={list}
      onReorder={reorder}
      renderRow={(c, handle) => (
        <div className="flex h-full items-center gap-1 pl-2 pr-1">
          <button type="button" aria-label={`${c.name} 지우기`} onClick={() => archive(c)} className="press flex size-11 shrink-0 items-center justify-center text-expense">
            <MinusCircle className="size-6" fill="currentColor" stroke="var(--app-surface)" aria-hidden />
          </button>
          <button type="button" onClick={() => onEdit(c)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-base">
            {c.icon ? <span aria-hidden>{c.icon}</span> : null}
            <span className="truncate">{c.name}</span>
          </button>
          <button type="button" aria-label={`${c.name} 고치기`} onClick={() => onEdit(c)} className="press flex size-11 shrink-0 items-center justify-center text-muted">
            <Pencil className="size-5" aria-hidden />
          </button>
          {handle}
        </div>
      )}
    />
  );
}

/** 분류 고치기·추가: 한 칸에 "🍚식비" 처럼 이모지까지 키보드로 넣는다. */
export function CategoryNameSheet({ kind, category, onClose, onSaved }: { kind: CategoryKind; category: Category | null; onClose: () => void; onSaved?: (c: Category) => void }) {
  const data = useData();
  const household = useCurrentHousehold();
  const { save } = useMutations();
  const [text, setText] = useState(category ? joinIconName(category.icon, category.name) : '');
  const parsed = splitIconName(text);
  const duplicate = data.categories.some((c) => c.kind === kind && !c.archived && c.name === parsed.name && c.id !== category?.id);

  // 닫히는 동안(애니메이션) 다시 눌러도 한 번만 저장한다.
  const submitted = useRef(false);
  const submit = (close: () => void) => {
    if (!parsed.name || duplicate || submitted.current) return;
    submitted.current = true;
    const list = data.categories.filter((c) => c.kind === kind);
    const row: Category = category
      ? { ...category, name: parsed.name.slice(0, 20), icon: parsed.icon }
      : {
          ...baseRow(household.householdId),
          kind,
          name: parsed.name.slice(0, 20),
          icon: parsed.icon,
          color: CATEGORY_COLORS[list.length % CATEGORY_COLORS.length]!,
          parent_id: null,
          sort: list.reduce((m, c) => Math.max(m, c.sort), -1) + 1,
          archived: false,
        };
    void save('categories', row);
    onSaved?.(row);
    close();
  };

  return (
    <Sheet
      title={category ? '분류수정' : '분류추가'}
      onClose={onClose}
      footer={(close) => (
        <Button block disabled={!parsed.name || duplicate} onClick={() => submit(close)}>
          저장하기
        </Button>
      )}
    >
      {(close) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(close);
          }}
          className="space-y-2 pt-1"
        >
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={30}
            aria-label="분류 이름"
            placeholder="🍚식비"
            enterKeyHint="done"
            className="h-12 w-full border-b-2 border-line bg-transparent text-lg outline-none focus:border-brand"
          />
          <p className="text-xs font-normal text-muted">
            {duplicate ? <span className="text-expense">같은 이름의 분류가 있어요.</span> : '맨 앞에 이모지를 넣으면 아이콘이 됩니다. 키보드의 이모지 버튼을 쓰세요.'}
          </p>
        </form>
      )}
    </Sheet>
  );
}

/** 입력 화면 분류판의 연필 → 전체 화면 분류 편집. 닫으면 입력판으로 돌아간다. */
export function CategoryManagerSheet({ kind, onClose }: { kind: CategoryKind; onClose: () => void }) {
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  return (
    <>
      <Sheet
        title={KIND_TITLE[kind]}
        full
        onClose={onClose}
        header={(close) => (
          <div className="flex h-12 items-center gap-1 border-b border-line px-2">
            <button type="button" aria-label="닫기" onClick={close} className="press flex size-11 items-center justify-center rounded-full">
              <ArrowLeft className="size-6" aria-hidden />
            </button>
            <h2 className="min-w-0 flex-1 truncate text-lg font-bold">{KIND_TITLE[kind]}</h2>
            <button type="button" aria-label="분류 추가" onClick={() => setEditing('new')} className="press flex size-11 items-center justify-center rounded-full">
              <Plus className="size-6" aria-hidden />
            </button>
          </div>
        )}
      >
        <CategoryList kind={kind} onEdit={setEditing} />
      </Sheet>
      {editing ? <CategoryNameSheet kind={kind} category={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}
