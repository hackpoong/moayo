import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { haptic } from './flash.ts';

const LONG_MS = 450;
const SWIPE_PX = 90;

/**
 * 내역 줄의 손짓: 길게 누르기(강한 진동), 좌우로 밀기.
 * 세로로 움직이면 스크롤로 보고 아무것도 하지 않는다(touch-action: pan-y).
 * 길게 누르거나 민 뒤에 따라오는 click 은 suppressClick() 으로 걸러 낸다.
 */
export function useRowGestures({
  onLongPress,
  onSwipeLeft,
  onSwipeRight,
  swipe,
}: {
  onLongPress: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  swipe: boolean;
}) {
  const [dx, setDx] = useState(0);
  const g = useRef<{ x: number; y: number; moved: boolean; horiz: boolean | null; timer: number; handled: boolean } | null>(null);
  const suppress = useRef(false);

  const end = () => {
    if (g.current) window.clearTimeout(g.current.timer);
    g.current = null;
    setDx(0);
  };

  const handlers = {
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      suppress.current = false;
      const state = { x: e.clientX, y: e.clientY, moved: false, horiz: null as boolean | null, handled: false, timer: 0 };
      state.timer = window.setTimeout(() => {
        if (state.moved) return;
        state.handled = true;
        suppress.current = true;
        haptic([30, 40, 60]);
        onLongPress();
      }, LONG_MS);
      g.current = state;
    },
    onPointerMove: (e: ReactPointerEvent) => {
      const s = g.current;
      if (!s || s.handled) return;
      const mx = e.clientX - s.x;
      const my = e.clientY - s.y;
      if (!s.moved && Math.hypot(mx, my) > 8) {
        s.moved = true;
        window.clearTimeout(s.timer);
        s.horiz = Math.abs(mx) > Math.abs(my) * 1.3;
      }
      // 기준(90px)을 넘으면 고무줄처럼 버티며 조금씩만 더 따라온다.
      if (s.horiz && swipe) {
        const over = Math.abs(mx) - SWIPE_PX;
        const eased = over > 0 ? SWIPE_PX + over * 0.35 : Math.abs(mx);
        setDx(Math.sign(mx) * Math.min(170, eased));
      }
    },
    onPointerUp: (e: ReactPointerEvent) => {
      const s = g.current;
      if (s && s.horiz && swipe && !s.handled) {
        const mx = e.clientX - s.x;
        suppress.current = true;
        if (mx <= -SWIPE_PX && onSwipeLeft) {
          haptic(15);
          onSwipeLeft();
        } else if (mx >= SWIPE_PX && onSwipeRight) {
          haptic(15);
          onSwipeRight();
        }
      }
      end();
    },
    onPointerCancel: end,
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  };

  return { dx, handlers, consumeClick: () => (suppress.current ? ((suppress.current = false), true) : false) };
}
