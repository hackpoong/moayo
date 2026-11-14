import { createContext, useContext } from 'react';

export interface ToastInput {
  message: string;
  action?: { label: string; onClick: () => void };
  tone?: 'default' | 'error';
  ms?: number;
}

export const ToastContext = createContext<((t: ToastInput) => void) | null>(null);

export function useToast(): (t: ToastInput) => void {
  const show = useContext(ToastContext);
  if (!show) throw new Error('ToastProvider 가 없습니다.');
  return show;
}
