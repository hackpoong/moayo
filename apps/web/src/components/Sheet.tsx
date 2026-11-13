import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

interface SheetProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** 휴대폰에서 화면을 거의 다 채운다. */
  tall?: boolean;
  headerExtra?: ReactNode;
}

/** 휴대폰에서는 아래에서 올라오는 시트, 넓은 화면에서는 가운데 대화상자. */
export function Sheet({ title, onClose, children, footer, tall, headerExtra }: SheetProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 md:items-center md:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={`sheet-enter pb-safe flex w-full max-w-lg flex-col rounded-t-3xl bg-surface md:max-h-[88vh] md:rounded-3xl ${tall ? 'h-[94dvh] md:h-auto' : 'max-h-[90dvh]'}`}
      >
        <header className="flex shrink-0 items-center gap-2 px-5 pb-2 pt-4">
          <h2 className="min-w-0 flex-1 truncate text-lg font-bold">{title}</h2>
          {headerExtra}
          <button type="button" aria-label="닫기" onClick={onClose} className="-mr-2 rounded-full p-2 text-muted hover:bg-surface-2">
            <X className="size-5" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer ? <footer className="shrink-0 border-t border-line px-5 py-3">{footer}</footer> : null}
      </div>
    </div>
  );
}
