import type { Attachment } from '@moayo/core';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePhotoUrl } from '../lib/photos.ts';

function Slide({ att }: { att: Attachment }) {
  // 큰 사진을 받는 동안 썸네일을 먼저 보여 준다.
  const full = usePhotoUrl(att.path);
  const thumb = usePhotoUrl(att.thumb_path);
  const src = full.url ?? thumb.url;
  return (
    <div className="flex h-full w-full shrink-0 snap-center items-center justify-center overflow-auto" style={{ touchAction: 'pan-x pan-y pinch-zoom' }}>
      {src ? <img src={src} alt="" className="max-h-full max-w-full object-contain" draggable={false} /> : <p className="text-sm text-white/70">사진을 받는 중…</p>}
    </div>
  );
}

/** 사진 전체 화면 보기: 좌우로 넘기기, 두 손가락 확대. 닫기는 ✕ 또는 뒤로가기(부모가 처리). */
export function PhotoViewer({ items, start, onClose }: { items: Attachment[]; start: number; onClose: () => void }) {
  const [index, setIndex] = useState(start);
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
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-contain [scrollbar-width:none]"
      >
        {items.map((a) => (
          <Slide key={a.id} att={a} />
        ))}
      </div>
      <div className="pb-safe h-6 shrink-0" />
    </div>,
    document.body,
  );
}
