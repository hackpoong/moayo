import { X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

interface SheetProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** 휴대폰에서 화면을 거의 다 채운다. */
  tall?: boolean;
  headerExtra?: ReactNode;
}

const CLOSE_MS = 180;
const HISTORY_KEY = 'moayoSheet';

/**
 * 휴대폰에서는 아래에서 올라오는 시트, 넓은 화면에서는 가운데 대화상자.
 *  * 열고 닫을 때 미끄러지는 애니메이션
 *  * 위쪽 손잡이를 아래로 끌면 닫힘
 *  * 안드로이드 뒤로가기 버튼을 누르면 화면을 떠나지 않고 시트만 닫힘
 */
export function Sheet({ title, onClose, children, footer, tall, headerExtra }: SheetProps) {
  const id = useId();
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const drag = useRef<{ startY: number; startT: number } | null>(null);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    window.setTimeout(() => onCloseRef.current(), reducedMotion() ? 0 : CLOSE_MS);
  }, []);

  // 뒤로가기: 열 때 기록을 하나 쌓고, 뒤로가기로 그 기록이 빠지면 시트를 닫는다.
  useEffect(() => {
    const state = (window.history.state ?? {}) as Record<string, unknown>;
    if (state[HISTORY_KEY]) window.history.replaceState({ ...state, [HISTORY_KEY]: id }, '');
    else window.history.pushState({ ...state, [HISTORY_KEY]: id }, '');
    const onPop = () => {
      if ((window.history.state as Record<string, unknown> | null)?.[HISTORY_KEY] !== id) requestClose();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // 다른 시트가 이어서 열리지 않았다면 쌓아 둔 기록을 걷어 낸다.
      window.setTimeout(() => {
        if ((window.history.state as Record<string, unknown> | null)?.[HISTORY_KEY] === id) window.history.back();
      }, 0);
    };
  }, [id, requestClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && requestClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [requestClose]);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse') return;
    // 머리글 안의 버튼(닫기·지우기)을 누른 것은 끌기가 아니다.
    if ((e.target as HTMLElement).closest('button, a, input, select')) return;
    drag.current = { startY: e.clientY, startT: performance.now() };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // 일부 브라우저는 이미 끝난 터치에 대해 예외를 던진다. 끌기는 그대로 동작한다.
    }
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    setDragY(Math.max(0, e.clientY - drag.current.startY));
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    const dy = Math.max(0, e.clientY - drag.current.startY);
    const speed = dy / Math.max(1, performance.now() - drag.current.startT);
    drag.current = null;
    if (dy > 110 || (dy > 30 && speed > 0.6)) requestClose();
    else setDragY(0);
  };

  return (
    <div
      className={`fixed inset-0 z-30 flex items-end justify-center bg-black/40 md:items-center md:p-6 ${closing ? 'backdrop-out' : 'backdrop-in'}`}
      onClick={requestClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
        className={`pb-safe flex w-full max-w-lg flex-col rounded-t-3xl bg-surface shadow-2xl md:max-h-[88vh] md:rounded-3xl ${tall ? 'h-[94dvh] md:h-auto' : 'max-h-[90dvh]'} ${closing ? 'sheet-out' : 'sheet-in'} ${dragY ? '' : 'sheet-settle'}`}
      >
        <div
          className="shrink-0 cursor-grab touch-none md:hidden"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-hidden
        >
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line" />
        </div>
        <header
          className="flex shrink-0 touch-none items-center gap-2 px-5 pb-2 pt-2 md:pt-4"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <h2 className="min-w-0 flex-1 truncate text-lg font-bold">{title}</h2>
          {headerExtra}
          <button type="button" aria-label="닫기" onClick={requestClose} className="press -mr-2 rounded-full p-2 text-muted hover:bg-surface-2">
            <X className="size-5" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
        {footer ? <footer className="shrink-0 border-t border-line px-5 py-3">{footer}</footer> : null}
      </div>
    </div>
  );
}

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
