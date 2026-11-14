import { X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface SheetProps {
  title: ReactNode;
  onClose: () => void;
  /** 함수로 주면 애니메이션 닫기(close)를 받는다. */
  children: ReactNode | ((close: () => void) => ReactNode);
  footer?: ReactNode | ((close: () => void) => ReactNode);
  /** 휴대폰에서 화면을 거의 다 채운다. */
  tall?: boolean;
  headerExtra?: ReactNode;
  /** 휴대폰에서 화면 전체를 쓰는 입력 페이지. 머리글은 header 로 직접 그린다. */
  full?: boolean;
  /** full 일 때 쓰는 머리글. close 를 부르면 애니메이션 후 닫힌다. */
  header?: (close: () => void) => ReactNode;
  /** 시트 바닥에 겹쳐 붙는 것(입력 패널 등). */
  overlay?: ReactNode;
  /** 뒤로가기를 먼저 받아 처리한다(예: 열린 입력판 닫기). true 를 돌려주면 시트는 닫지 않는다. */
  onBack?: () => boolean;
}

/** 지금 열려 있는 시트들(바깥 → 안쪽). 안쪽 시트는 뒤로가기 기록을 따로 쌓는다. */
const openSheets: string[] = [];

const CLOSE_MS = 180;
const HISTORY_KEY = 'moayoSheet';

/**
 * 휴대폰에서는 아래에서 올라오는 시트, 넓은 화면에서는 가운데 대화상자.
 *  * 열고 닫을 때 미끄러지는 애니메이션
 *  * 위쪽 손잡이를 아래로 끌면 닫힘
 *  * 안드로이드 뒤로가기 버튼을 누르면 화면을 떠나지 않고 시트만 닫힘
 */
export function Sheet({ title, onClose, children, footer, tall, headerExtra, full, header, overlay, onBack }: SheetProps) {
  const id = useId();
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const drag = useRef<{ startY: number; startT: number } | null>(null);
  const onCloseRef = useRef(onClose);
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onCloseRef.current = onClose;
    onBackRef.current = onBack;
  }, [onClose, onBack]);

  // 닫기는 상태만 바꾸고, 내려가는 애니메이션이 끝나면 effect 가 onClose 를 부른다.
  const requestClose = useCallback(() => setClosing(true), []);
  useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(() => onCloseRef.current(), reducedMotion() ? 0 : CLOSE_MS);
    return () => window.clearTimeout(t);
  }, [closing]);

  // 뒤로가기: 열 때 기록을 하나 쌓고, 뒤로가기로 그 기록이 빠지면 시트를 닫는다.
  useEffect(() => {
    const state = (window.history.state ?? {}) as Record<string, unknown>;
    // 다른 시트 위에 열리면 기록을 하나 더 쌓고, 방금 닫힌 시트를 이어받는 경우에는 그 기록을 바꿔 쓴다.
    if (state[HISTORY_KEY] && openSheets.length === 0) window.history.replaceState({ ...state, [HISTORY_KEY]: id }, '');
    else window.history.pushState({ ...state, [HISTORY_KEY]: id }, '');
    openSheets.push(id);
    const onPop = () => {
      const now = (window.history.state ?? {}) as Record<string, unknown>;
      if (now[HISTORY_KEY] === id) return;
      // 맨 위 시트가 뒤로가기를 처리했으면 빠진 기록을 다시 쌓고 열어 둔다.
      if (openSheets.at(-1) === id && onBackRef.current?.()) {
        window.history.pushState({ ...now, [HISTORY_KEY]: id }, '');
        return;
      }
      requestClose();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      openSheets.splice(openSheets.indexOf(id), 1);
      // 다른 시트가 이어서 열리지 않았다면 쌓아 둔 기록을 걷어 낸다.
      window.setTimeout(() => {
        if ((window.history.state as Record<string, unknown> | null)?.[HISTORY_KEY] === id) window.history.back();
      }, 0);
    };
  }, [id, requestClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || openSheets.at(-1) !== id) return;
      if (!onBackRef.current?.()) requestClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [id, requestClose]);

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

  return createPortal(
    <div
      className={`fixed inset-0 z-30 flex items-end justify-center bg-black/40 md:items-center md:p-6 ${closing ? 'backdrop-out' : 'backdrop-in'}`}
      onClick={requestClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        onClick={(e) => e.stopPropagation()}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
        className={`relative flex w-full flex-col overflow-hidden bg-surface shadow-2xl ${
          full ? 'h-dvh md:h-[88vh] md:max-w-lg md:rounded-3xl' : `pb-safe max-w-lg rounded-t-3xl md:max-h-[88vh] md:rounded-3xl ${tall ? 'h-[94dvh] md:h-auto' : 'max-h-[90dvh]'}`
        } ${closing ? 'sheet-out' : 'sheet-in'} ${dragY ? '' : 'sheet-settle'}`}
      >
        {full ? (
          <div className="pt-safe shrink-0 touch-none" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
            {header?.(requestClose)}
          </div>
        ) : (
          <>
            <div className="shrink-0 cursor-grab touch-none md:hidden" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} aria-hidden>
              <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line" />
            </div>
            <header className="flex shrink-0 touch-none items-center gap-2 px-5 pb-2 pt-2 md:pt-4" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
              <h2 className="min-w-0 flex-1 truncate text-lg font-bold">{title}</h2>
              {headerExtra}
              <button type="button" aria-label="닫기" onClick={requestClose} className="press -mr-2 rounded-full p-2 text-muted hover:bg-surface-2">
                <X className="size-5" aria-hidden />
              </button>
            </header>
          </>
        )}
        <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${full ? '' : 'px-5 pb-4'}`}>{typeof children === 'function' ? children(requestClose) : children}</div>
        {footer ? (
          <footer className={`shrink-0 border-t border-line px-5 py-3 ${full ? 'pb-safe' : ''}`}>{typeof footer === 'function' ? footer(requestClose) : footer}</footer>
        ) : null}
        {overlay}
      </div>
    </div>,
    document.body,
  );
}

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
