import { Camera, Pencil, Plus, ReceiptText } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EditorRequest } from '../editor/editorContext.ts';
import { haptic } from '../lib/flash.ts';

const MARK = 'moayoAddMenu';

const ITEMS = [
  { key: 'manual', label: '수동으로 입력', icon: Pencil },
  { key: 'image', label: '이미지로 입력', icon: ReceiptText },
  { key: 'camera', label: '카메라로 입력', icon: Camera },
] as const;

/**
 * 오른쪽 아래 + 버튼. 누르면 같은 모양 원 3개가 물방울처럼 위로 떨어져 나온다.
 * 수동으로 입력 · 이미지로 입력(갤러리 바로) · 카메라로 입력(카메라 바로).
 */
export function AddMenu({ open: openEditor }: { open: (req?: EditorRequest) => void }) {
  const [state, setState] = useState<'closed' | 'open' | 'closing'>('closed');
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const pushed = useRef(false);

  const close = (viaBack = false) => {
    setState((s) => (s === 'open' ? 'closing' : s));
    window.setTimeout(() => setState('closed'), 160);
    if (pushed.current) {
      pushed.current = false;
      if (!viaBack && (window.history.state as Record<string, unknown> | null)?.[MARK]) window.history.back();
    }
  };

  const toggle = () => {
    haptic(10);
    if (state === 'open') return close();
    setState('open');
    pushed.current = true;
    window.history.pushState({ ...((window.history.state as object | null) ?? {}), [MARK]: 1 }, '');
  };

  useEffect(() => {
    const onPop = () => {
      if (pushed.current && !(window.history.state as Record<string, unknown> | null)?.[MARK]) {
        pushed.current = false;
        setState((s) => (s === 'open' ? 'closing' : s));
        window.setTimeout(() => setState('closed'), 160);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const pickFiles = (files: FileList | null) => {
    if (files?.length) openEditor({ importMode: 'image', files: [...files] });
  };

  /**
   * 메뉴가 쌓아 둔 뒤로가기 기록을 걷어 낸 '뒤에' 입력 화면을 연다(먼저 열면 걷어 내는 순간 같이 닫힌다).
   * 사진 고르기는 누른 순간에만 열 수 있어서 바로 열고, 기록은 그다음에 걷어 낸다.
   */
  const run = (key: (typeof ITEMS)[number]['key']) => {
    haptic(8);
    setState('closing');
    window.setTimeout(() => setState('closed'), 160);
    if (key === 'image') gallery.current?.click();
    if (key === 'camera') camera.current?.click();
    const hadEntry = pushed.current && !!(window.history.state as Record<string, unknown> | null)?.[MARK];
    pushed.current = false;
    if (key !== 'manual') {
      if (hadEntry) window.history.back();
      return;
    }
    if (!hadEntry) return openEditor();
    const after = () => {
      window.removeEventListener('popstate', after);
      openEditor();
    };
    window.addEventListener('popstate', after);
    window.history.back();
  };
  const shown = state !== 'closed';

  return (
    <>
      <input ref={gallery} type="file" accept="image/*" multiple className="hidden" onChange={(e) => (pickFiles(e.target.files), (e.target.value = ''))} />
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => (pickFiles(e.target.files), (e.target.value = ''))} />
      {shown
        ? createPortal(
            <div className="fixed inset-0 z-20 md:hidden" onClick={() => close()} aria-hidden />,
            document.body,
          )
        : null}
      <div className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] right-4 z-30 flex flex-col items-center md:hidden">
        {shown ? (
          <ul className="pointer-events-auto mb-4 flex flex-col items-center gap-3" role="menu" aria-label="입력 방법">
            {ITEMS.map((it, i) => (
              <li
                key={it.key}
                className={`flex flex-col items-center ${state === 'closing' ? 'drop-in-out' : 'drop-out'}`}
                style={{ animationDelay: state === 'closing' ? '0ms' : `${(ITEMS.length - 1 - i) * 55}ms`, ['--drop-from' as string]: `${(ITEMS.length - i) * 84}px` }}
              >
                <button
                  type="button"
                  role="menuitem"
                  aria-label={it.label}
                  onClick={() => run(it.key)}
                  className="press flex size-14 items-center justify-center rounded-full bg-brand text-brand-fg shadow-lg shadow-black/20 active:scale-95"
                >
                  <it.icon className="size-6" aria-hidden />
                </button>
                <span className="mt-1 text-[12px] font-semibold text-brand [text-shadow:0_0_3px_var(--app-bg),0_0_3px_var(--app-bg)]">{it.label}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <button
          type="button"
          aria-label={state === 'open' ? '입력 메뉴 닫기' : '내역 추가'}
          aria-expanded={state === 'open'}
          onClick={toggle}
          className="press vt-fab pointer-events-auto flex size-14 items-center justify-center rounded-full bg-brand text-brand-fg shadow-lg shadow-black/20 active:scale-95"
        >
          <Plus className={`size-7 transition-transform duration-200 ease-out ${state === 'open' ? 'rotate-[135deg]' : ''}`} aria-hidden />
        </button>
      </div>
    </>
  );
}
