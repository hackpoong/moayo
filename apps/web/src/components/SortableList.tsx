import { Menu } from 'lucide-react';
import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { haptic } from '../lib/flash.ts';

/**
 * 손잡이(≡)를 끌어 순서를 바꾸는 목록. 줄 높이는 같다고 본다.
 * 놓으면 onReorder(새 순서의 id 목록)를 부른다.
 */
export function SortableList<T extends { id: string }>({
  items,
  rowHeight = 52,
  renderRow,
  onReorder,
}: {
  items: readonly T[];
  rowHeight?: number;
  renderRow: (item: T, handle: ReactNode) => ReactNode;
  onReorder: (ids: string[]) => void;
}) {
  const [drag, setDrag] = useState<{ id: string; from: number; dy: number } | null>(null);
  const startY = useRef(0);

  const target = drag ? Math.max(0, Math.min(items.length - 1, drag.from + Math.round(drag.dy / rowHeight))) : -1;

  const down = (e: ReactPointerEvent, id: string, index: number) => {
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // 일부 브라우저는 끝난 터치에 예외를 던진다.
    }
    startY.current = e.clientY;
    haptic(10);
    setDrag({ id, from: index, dy: 0 });
  };
  const move = (e: ReactPointerEvent) => {
    if (!drag) return;
    setDrag({ ...drag, dy: e.clientY - startY.current });
  };
  const up = () => {
    if (!drag) return;
    const ids = items.map((x) => x.id);
    const [moved] = ids.splice(drag.from, 1);
    ids.splice(target, 0, moved!);
    setDrag(null);
    if (target !== drag.from) {
      haptic(8);
      onReorder(ids);
    }
  };

  return (
    <ul className="relative">
      {items.map((item, i) => {
        let shift = 0;
        if (drag && item.id !== drag.id) {
          if (drag.from < target && i > drag.from && i <= target) shift = -rowHeight;
          if (drag.from > target && i < drag.from && i >= target) shift = rowHeight;
        }
        const dragging = drag?.id === item.id;
        const handle = (
          <span
            role="button"
            aria-label="끌어서 순서 바꾸기"
            tabIndex={-1}
            onPointerDown={(e) => down(e, item.id, i)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center text-muted"
          >
            <Menu className="size-5" aria-hidden />
          </span>
        );
        return (
          <li
            key={item.id}
            style={{
              height: rowHeight,
              transform: `translateY(${dragging ? drag.dy : shift}px)`,
              transition: dragging ? 'none' : 'transform 160ms ease',
              zIndex: dragging ? 2 : 1,
            }}
            className={`relative border-b border-line bg-surface ${dragging ? 'shadow-lg' : ''}`}
          >
            {renderRow(item, handle)}
          </li>
        );
      })}
    </ul>
  );
}
