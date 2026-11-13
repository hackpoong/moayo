import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand text-brand-fg active:opacity-80',
  secondary: 'bg-surface-2 text-fg active:opacity-70',
  ghost: 'text-muted hover:bg-surface-2 active:opacity-70',
  danger: 'bg-expense/10 text-expense active:opacity-70',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  busy?: boolean;
  block?: boolean;
}

export function Button({ variant = 'primary', busy, block, className = '', children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-semibold transition-opacity disabled:opacity-50 ${VARIANT[variant]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

export function Field({ label, hint, className = '', ...rest }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-muted">{label}</span>
      <input
        className={`h-12 w-full rounded-xl border border-line bg-surface px-4 text-base text-fg outline-none placeholder:text-muted/60 focus:border-brand ${className}`}
        {...rest}
      />
      {hint ? <span className="mt-1.5 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-surface p-5 ${className}`}>{children}</section>;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl bg-expense/10 px-4 py-3 text-sm text-expense">
      {children}
    </p>
  );
}

export function Splash() {
  return (
    <div className="flex h-full items-center justify-center" aria-busy="true" aria-label="불러오는 중">
      <LoaderCircle className="size-7 animate-spin text-muted" aria-hidden />
    </div>
  );
}

/** 로그인·가입 화면처럼 가운데에 좁게 놓는 화면의 틀. */
export function CenteredPage({ children }: { children: ReactNode }) {
  return (
    <main className="pt-safe pb-safe mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-6 px-5 py-10">
      {children}
    </main>
  );
}

export function Logo({ className = 'size-14' }: { className?: string }) {
  return <img src="/icon.svg" alt="" className={`${className} rounded-2xl`} />;
}
