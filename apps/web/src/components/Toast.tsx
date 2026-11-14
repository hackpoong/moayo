import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ToastContext, type ToastInput } from './toastContext.ts';

interface ToastItem extends ToastInput {
  id: number;
  leaving: boolean;
}

/** 화면 아래 짧은 알림. 한 번에 하나만 보이고, 새 알림이 오면 바꿔 끼운다. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const seq = useRef(0);
  const timers = useRef<number[]>([]);

  const show = useCallback((t: ToastInput) => {
    timers.current.forEach(clearTimeout);
    const id = ++seq.current;
    setToast({ ...t, id, leaving: false });
    const ms = t.ms ?? (t.action ? 3500 : 2000);
    timers.current = [
      window.setTimeout(() => setToast((cur) => (cur?.id === id ? { ...cur, leaving: true } : cur)), ms),
      window.setTimeout(() => setToast((cur) => (cur?.id === id ? null : cur)), ms + 200),
    ];
  }, []);

  const value = useMemo(() => show, [show]);

  // 시트(아래에서 올라오는 창)가 열려 있으면 그 버튼을 가리지 않게 화면 위쪽에 띄운다.
  const [onTop, setOnTop] = useState(false);
  const visible = !!toast;
  useEffect(() => {
    if (!visible) return;
    const check = () => setOnTop(!!document.querySelector('[role="dialog"]'));
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true });
    return () => mo.disconnect();
  }, [visible]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast
        ? createPortal(
            <div
              className={`pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4 ${
                onTop ? 'top-[calc(env(safe-area-inset-top)+0.75rem)]' : 'bottom-[calc(env(safe-area-inset-bottom)+9rem)] md:bottom-8'
              }`}
            >
              <div
                role="status"
                key={toast.id}
                className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-[15px] shadow-xl ${toast.leaving ? 'toast-out' : 'toast-in'} ${toast.tone === 'error' ? 'bg-expense text-white' : 'bg-fg text-bg'}`}
              >
                <span className="min-w-0 flex-1">{toast.message}</span>
                {toast.action ? (
                  <button
                    type="button"
                    onClick={() => {
                      toast.action!.onClick();
                      setToast(null);
                    }}
                    className="press shrink-0 font-semibold text-brand-soft underline-offset-2"
                  >
                    {toast.action.label}
                  </button>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}
