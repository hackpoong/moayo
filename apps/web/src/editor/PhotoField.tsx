import type { Attachment } from '@moayo/core';
import { Camera, Images, LoaderCircle, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { usePhotoUrl } from '../lib/photos.ts';

/** 메모 줄 오른쪽 📷: 누르면 카메라 / 갤러리. */
export function PhotoAddButton({ disabled, onFiles }: { disabled?: boolean; onFiles: (files: File[]) => void }) {
  const [open, setOpen] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  const pick = (input: HTMLInputElement | null) => {
    setOpen(false);
    input?.click();
  };
  const take = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (files.length) onFiles(files);
  };
  return (
    <div ref={boxRef} className="relative shrink-0">
      <button
        type="button"
        aria-label="사진 붙이기"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="press flex size-11 items-center justify-center rounded-full text-muted disabled:opacity-30"
      >
        <Camera className="size-6" aria-hidden />
      </button>
      {open ? (
        <div role="menu" className="pop-in absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-xl bg-surface py-1 shadow-lg ring-1 ring-line">
          <button type="button" role="menuitem" onClick={() => pick(camRef.current)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] active:bg-surface-2">
            <Camera className="size-5 text-muted" aria-hidden />
            카메라
          </button>
          <button type="button" role="menuitem" onClick={() => pick(galRef.current)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] active:bg-surface-2">
            <Images className="size-5 text-muted" aria-hidden />
            갤러리
          </button>
        </div>
      ) : null}
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={take} data-testid="photo-camera" />
      <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={take} data-testid="photo-gallery" />
    </div>
  );
}

function Thumb({ att, onOpen, onRemove, wide }: { att: Attachment; onOpen: () => void; onRemove: () => void; wide: boolean }) {
  const { url } = usePhotoUrl(att.thumb_path);
  return (
    <div className={`relative overflow-hidden rounded-xl bg-surface-2 ${wide ? 'aspect-[16/9]' : 'aspect-[4/3]'}`}>
      {url ? (
        <button type="button" onClick={onOpen} aria-label="사진 크게 보기" className="block size-full">
          <img src={url} alt="" className="size-full object-cover" draggable={false} />
        </button>
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 text-xs text-muted">
          <LoaderCircle className="size-5 animate-spin" aria-hidden />
          올리는 중
        </div>
      )}
      <button
        type="button"
        aria-label="사진 빼기"
        onClick={onRemove}
        className="absolute right-0 top-0 flex size-9 items-center justify-center rounded-bl-xl bg-black/55 text-white"
      >
        <X className="size-5" aria-hidden />
      </button>
    </div>
  );
}

/** 메모 아래 사진들: 1장이면 가로 가득, 2장부터 2열. */
export function PhotoGrid({ items, onOpen, onRemove }: { items: Attachment[]; onOpen: (i: number) => void; onRemove: (a: Attachment) => void }) {
  if (!items.length) return null;
  return (
    <div className={`grid gap-1.5 ${items.length > 1 ? 'grid-cols-2' : ''}`}>
      {items.map((a, i) => (
        <Thumb key={a.id} att={a} wide={items.length === 1} onOpen={() => onOpen(i)} onRemove={() => onRemove(a)} />
      ))}
    </div>
  );
}
