import { Camera, Pencil, Plus, ReceiptText } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router';
import type { EditorRequest } from '../editor/editorContext.ts';
import { haptic } from '../lib/flash.ts';
import { expandFrom, flyDot, play } from '../lib/motion.ts';

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
  const location = useLocation();
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const pushed = useRef(false);
  const fab = useRef<HTMLButtonElement>(null);
  // 목록을 내리면 + 가 아래로 숨고, 올리면 다시 나온다.
  const [tucked, setTucked] = useState(false);
  // 처음 쓰는 사람에게만 한 번 빛난다.
  const [glow, setGlow] = useState(() => {
    try {
      return !localStorage.getItem('moayo-fab-seen');
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 8) return;
      setTucked(y > last && y > 120);
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // 저장하면 보라 점이 + 로 날아와 꿀꺽 삼킨다.
  useEffect(() => {
    const onSaved = (e: Event) => {
      const from = (e as CustomEvent<DOMRect | null>).detail;
      const el = fab.current;
      if (!el || !from || el.offsetParent === null) return;
      setTucked(false);
      void flyDot(from, el.getBoundingClientRect()).then(() =>
        play(el, [{ transform: 'scale(1)' }, { transform: 'scale(1.18)', offset: 0.35 }, { transform: 'scale(0.94)', offset: 0.7 }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' }),
      );
    };
    window.addEventListener('moayo-saved', onSaved);
    return () => window.removeEventListener('moayo-saved', onSaved);
  }, []);

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
    if (glow) {
      setGlow(false);
      try {
        localStorage.setItem('moayo-fab-seen', '1');
      } catch {
        /* 저장 못 해도 괜찮다 */
      }
    }
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

  const pickFiles = (files: FileList | null, fromCamera = false) => {
    if (files?.length) openEditor({ importMode: 'image', files: [...files], fromCamera });
  };

  /**
   * 메뉴가 쌓아 둔 뒤로가기 기록을 걷어 낸 '뒤에' 입력 화면을 연다(먼저 열면 걷어 내는 순간 같이 닫힌다).
   * 사진 고르기는 누른 순간에만 열 수 있어서 바로 열고, 기록은 그다음에 걷어 낸다.
   */
  const run = (key: (typeof ITEMS)[number]['key'], from?: HTMLElement) => {
    haptic(8);
    // 수동 입력: 누른 원이 화면 가득 퍼지며 입력 화면이 된다.
    const openManual = () => {
      const rect = from?.getBoundingClientRect();
      if (!rect) return openEditor();
      void expandFrom(rect).then((fade) => {
        openEditor();
        window.setTimeout(fade, 140);
      });
    };
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
    if (!hadEntry) return openManual();
    const after = () => {
      window.removeEventListener('popstate', after);
      openManual();
    };
    window.addEventListener('popstate', after);
    window.history.back();
  };
  const shown = state !== 'closed';
  // 통계·더보기 화면에서는 + 를 보이지 않는다.
  const hiddenHere = /^\/(stats|more)(\/|$)/.test(location.pathname);

  if (hiddenHere && !shown) return null;
  return (
    <>
      <input ref={gallery} type="file" accept="image/*" multiple className="hidden" onChange={(e) => (pickFiles(e.target.files), (e.target.value = ''))} />
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => (pickFiles(e.target.files, true), (e.target.value = ''))} />
      {shown
        ? createPortal(
            <div className="fixed inset-0 z-20 md:hidden" onClick={() => close()} aria-hidden />,
            document.body,
          )
        : null}
      <div
        className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] right-4 z-30 flex flex-col items-center transition-transform duration-300 ease-out md:hidden"
        style={{ transform: tucked && !shown ? 'translateY(calc(100% + 6rem))' : undefined }}
      >
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
                  onClick={(e) => run(it.key, e.currentTarget)}
                  className="fab-spring flex size-14 items-center justify-center rounded-full bg-brand text-brand-fg shadow-lg shadow-black/20"
                >
                  <it.icon className="size-6" aria-hidden />
                </button>
                <span className="mt-1 text-[12px] font-semibold text-brand [text-shadow:0_0_3px_var(--app-bg),0_0_3px_var(--app-bg)]">{it.label}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <button
          ref={fab}
          type="button"
          aria-label={state === 'open' ? '입력 메뉴 닫기' : '내역 추가'}
          aria-expanded={state === 'open'}
          onClick={toggle}
          className={`fab-spring vt-fab pointer-events-auto flex size-14 items-center justify-center rounded-full bg-brand text-brand-fg shadow-lg shadow-black/20 ${glow ? 'fab-glow' : ''}`}
        >
          {/* ✕ 로 돌 때 살짝 넘쳤다 돌아온다 */}
          <Plus
            className="size-7 transition-transform duration-[420ms]"
            style={{ transform: state === 'open' ? 'rotate(135deg)' : undefined, transitionTimingFunction: 'var(--back-out)' }}
            aria-hidden
          />
        </button>
      </div>
    </>
  );
}
