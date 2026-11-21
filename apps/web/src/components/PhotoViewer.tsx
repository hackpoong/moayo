import type { Attachment } from '@moayo/core';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePhotoUrl } from '../lib/photos.ts';

interface View {
  scale: number;
  x: number;
  y: number;
}

/**
 * 사진 한 장. 앱 전체는 확대를 막았으므로 여기서 직접 확대한다:
 * 두 손가락으로 벌리기·오므리기, 확대한 채 한 손가락으로 옮기기, 두 번 눌러 확대/원래대로.
 */
function Slide({ att, onZoomed }: { att: Attachment; onZoomed: (zoomed: boolean) => void }) {
  // 큰 사진을 받는 동안 썸네일을 먼저 보여 준다.
  const full = usePhotoUrl(att.path);
  const thumb = usePhotoUrl(att.thumb_path);
  const src = full.url ?? thumb.url;
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ dist: number; view: View; mid: { x: number; y: number } } | null>(null);
  const lastTap = useRef(0);
  // 손가락이 닿아 있는 동안은 애니메이션 없이 바로 따라온다.
  const [touching, setTouching] = useState(false);

  const apply = (v: View) => {
    const scale = Math.min(5, Math.max(1, v.scale));
    const next = scale === 1 ? { scale: 1, x: 0, y: 0 } : { ...v, scale };
    setView(next);
    onZoomed(next.scale > 1);
  };
  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const mid = () => {
    const ps = [...pointers.current.values()];
    return { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length };
  };

  return (
    <div
      className="flex h-full w-full shrink-0 snap-center items-center justify-center overflow-hidden"
      style={{ touchAction: view.scale > 1 ? 'none' : 'pan-x' }}
      onPointerDown={(e) => {
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        setTouching(true);
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        start.current = { dist: dist(), view, mid: mid() };
        if (pointers.current.size === 1) {
          const now = performance.now();
          if (now - lastTap.current < 280) apply(view.scale > 1 ? { scale: 1, x: 0, y: 0 } : { scale: 2.5, x: 0, y: 0 });
          lastTap.current = now;
        }
      }}
      onPointerMove={(e) => {
        if (!pointers.current.has(e.pointerId) || !start.current) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const s = start.current;
        const m = mid();
        if (pointers.current.size >= 2 && s.dist > 0) apply({ scale: (s.view.scale * dist()) / s.dist, x: s.view.x + m.x - s.mid.x, y: s.view.y + m.y - s.mid.y });
        else if (view.scale > 1) apply({ ...s.view, x: s.view.x + m.x - s.mid.x, y: s.view.y + m.y - s.mid.y });
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId);
        start.current = pointers.current.size ? { dist: dist(), view, mid: mid() } : null;
        if (!pointers.current.size) setTouching(false);
      }}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        if (!pointers.current.size) setTouching(false);
      }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="max-h-full max-w-full object-contain"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transition: touching ? 'none' : 'transform 160ms ease-out' }}
          draggable={false}
        />
      ) : (
        <p className="text-sm text-white/70">사진을 받는 중…</p>
      )}
    </div>
  );
}

/** 사진 전체 화면 보기: 좌우로 넘기기, 두 손가락 확대. 닫기는 ✕ 또는 뒤로가기(부모가 처리). */
export function PhotoViewer({ items, start, onClose }: { items: Attachment[]; start: number; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  // 확대한 동안에는 좌우로 넘기지 않는다(손가락이 사진을 옮긴다).
  const [zoomed, setZoomed] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = track.current;
    if (el) el.scrollLeft = el.clientWidth * start;
  }, [start]);
  return createPortal(
    <div role="dialog" aria-modal aria-label="사진" className="fade-in fixed inset-0 z-[60] flex flex-col bg-black text-white">
      <div className="flex h-12 shrink-0 items-center justify-between px-2">
        <span className="px-3 text-sm tabular-nums text-white/80">
          {index + 1} / {items.length}
        </span>
        <button type="button" aria-label="닫기" onClick={onClose} className="flex size-11 items-center justify-center rounded-full">
          <X className="size-6" aria-hidden />
        </button>
      </div>
      <div
        ref={track}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
        className={`flex min-h-0 flex-1 snap-x snap-mandatory overscroll-contain [scrollbar-width:none] ${zoomed ? 'overflow-x-hidden' : 'overflow-x-auto'}`}
      >
        {items.map((a) => (
          <Slide key={a.id} att={a} onZoomed={setZoomed} />
        ))}
      </div>
      <div className="pb-safe h-6 shrink-0" />
    </div>,
    document.body,
  );
}
