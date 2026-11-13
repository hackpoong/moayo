import { ArrowDown, ArrowUp, ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

export function SettingsHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="flex items-center gap-1">
      <Link to="/more" aria-label="더보기로" className="-ml-2 rounded-full p-2 text-muted hover:bg-surface-2">
        <ChevronLeft className="size-6" aria-hidden />
      </Link>
      <h1 className="flex-1 text-2xl font-bold">{title}</h1>
      {action}
    </header>
  );
}

export function MoveButtons({ onUp, onDown, label }: { onUp?: () => void; onDown?: () => void; label: string }) {
  return (
    <span className="flex">
      <button type="button" aria-label={`${label} 위로`} disabled={!onUp} onClick={onUp} className="rounded-full p-1.5 text-muted disabled:opacity-20">
        <ArrowUp className="size-4" aria-hidden />
      </button>
      <button type="button" aria-label={`${label} 아래로`} disabled={!onDown} onClick={onDown} className="rounded-full p-1.5 text-muted disabled:opacity-20">
        <ArrowDown className="size-4" aria-hidden />
      </button>
    </span>
  );
}

export function Labeled({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}
