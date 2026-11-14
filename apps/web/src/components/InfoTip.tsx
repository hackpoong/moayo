import { Info } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/** 작은 ⓘ: 누르면 말풍선으로 안내를 보여 주고, 바깥을 누르면 닫힌다. */
export function InfoTip({ text, label = '안내 보기' }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="press -m-1.5 flex size-7 items-center justify-center rounded-full text-muted/70"
      >
        <Info className="size-3.5" aria-hidden />
      </button>
      {open ? (
        <span role="tooltip" className="backdrop-in absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg bg-fg px-2.5 py-1.5 text-xs font-semibold text-bg shadow-lg">
          {text}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-fg" aria-hidden />
        </span>
      ) : null}
    </span>
  );
}
