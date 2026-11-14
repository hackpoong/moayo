// 움직임 도구: transform·opacity 만 움직여 60fps 를 지키고, '동작 줄이기' 설정이면 바로 끝난 상태로 둔다.

import { createElement, useEffect, useRef, useState } from 'react';

/** 살짝 넘쳤다 돌아오는 스프링(CSS linear() 근사). */
export const SPRING =
  'linear(0, 0.009, 0.035 2.1%, 0.141 4.4%, 0.723 12.9%, 0.938 16.7%, 1.017 19.4%, 1.067, 1.099 24.3%, 1.108 26%, 1.1, 1.083 30.4%, 1.026 35.6%, 1.003 40%, 0.991 43.6%, 0.992 47.3%, 1.002 57.8%, 0.999 69.2%, 1)';
export const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Web Animations API 를 쓰되, 줄이기 설정이거나 지원하지 않으면 바로 끝낸다. */
export function play(el: Element | null | undefined, frames: Keyframe[], options: KeyframeAnimationOptions): Promise<void> {
  if (!el || reducedMotion() || typeof el.animate !== 'function') return Promise.resolve();
  return el
    .animate(frames, options)
    .finished.then(() => undefined)
    .catch(() => undefined);
}

/** 화면에 잠깐 붙였다 떼는 장식 요소. */
function overlay(style: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const el = document.createElement('div');
  Object.assign(el.style, { position: 'fixed', pointerEvents: 'none', zIndex: '45', ...style });
  document.body.appendChild(el);
  return el;
}

/** 보라 원이 rect 에서 화면 가득 퍼진다(+ 버튼 → 입력 화면). 다 퍼지면 resolve, 이어서 사라진다. */
export async function expandFrom(rect: DOMRect, color = 'var(--app-brand)'): Promise<() => void> {
  if (reducedMotion()) return () => undefined;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const r = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy));
  const el = overlay({ inset: '0', background: color, clipPath: `circle(${rect.width / 2}px at ${cx}px ${cy}px)` });
  await play(el, [{ clipPath: `circle(${rect.width / 2}px at ${cx}px ${cy}px)` }, { clipPath: `circle(${r}px at ${cx}px ${cy}px)` }], {
    duration: 300,
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    fill: 'forwards',
  });
  return () => void play(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-out', fill: 'forwards' }).then(() => el.remove());
}

/** 작은 보라 점이 from 에서 to 로 포물선을 그리며 날아간다(저장 → + 버튼). */
export async function flyDot(from: DOMRect, to: DOMRect): Promise<void> {
  if (reducedMotion()) return;
  const size = 18;
  const el = overlay({ left: '0', top: '0', width: `${size}px`, height: `${size}px`, borderRadius: '999px', background: 'var(--app-brand)' });
  const x0 = from.left + from.width / 2 - size / 2;
  const y0 = from.top + from.height / 2 - size / 2;
  const x1 = to.left + to.width / 2 - size / 2;
  const y1 = to.top + to.height / 2 - size / 2;
  const peak = Math.min(y0, y1) - 80;
  await play(
    el,
    [
      { transform: `translate(${x0}px, ${y0}px) scale(1.4)`, opacity: 0.9 },
      { transform: `translate(${(x0 + x1) / 2}px, ${peak}px) scale(1)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${x1}px, ${y1}px) scale(0.5)`, opacity: 0.6 },
    ],
    { duration: 520, easing: 'cubic-bezier(0.5, 0, 0.5, 1)' },
  );
  el.remove();
}

/** 줄을 납작하게 접으며 없앤다(지울 때). */
export async function collapse(el: HTMLElement | null): Promise<void> {
  if (!el || reducedMotion()) return;
  const h = el.getBoundingClientRect().height;
  el.style.overflow = 'hidden';
  await play(
    el,
    [
      { height: `${h}px`, opacity: 1 },
      { height: '0px', opacity: 0 },
    ],
    { duration: 220, easing: EASE_OUT, fill: 'forwards' },
  );
}

/** 여러 줄이 기준 줄 쪽으로 빨려 들어간다(병합). */
export async function suckInto(els: HTMLElement[], target: HTMLElement | null): Promise<void> {
  if (!target || reducedMotion()) return;
  const t = target.getBoundingClientRect();
  await Promise.all([
    ...els.map((el) => {
      const r = el.getBoundingClientRect();
      return play(
        el,
        [
          { transform: 'none', opacity: 1 },
          { transform: `translateY(${t.top - r.top}px) scale(0.92)`, opacity: 0 },
        ],
        { duration: 320, easing: 'cubic-bezier(0.55, 0, 0.45, 1)', fill: 'forwards' },
      );
    }),
    play(target, [{ transform: 'scale(1)' }, { transform: 'scale(1.03)', offset: 0.7 }, { transform: 'scale(1)' }], { duration: 420, easing: EASE_OUT, delay: 150 }),
  ]);
}

/** 숫자가 이전 값에서 새 값으로 차르르 바뀐다. */
export function useCountUp(value: number, ms = 600): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value || reducedMotion()) {
      from.current = value;
      setShown(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(start + (value - start) * eased);
      from.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

/** 저장했다고 + 버튼에 알린다(점이 날아가고 + 가 꿀꺽). */
export function announceSaved(from: DOMRect | null): void {
  window.dispatchEvent(new CustomEvent('moayo-saved', { detail: from }));
}

/** 숫자 글자만 다시 그리는 카운트업(부모 화면 전체를 매 프레임 다시 그리지 않는다). */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  return createElement('span', null, format(useCountUp(value)));
}
