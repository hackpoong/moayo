import { ImagePlus, Plus } from 'lucide-react';

/** 홈의 '사진·캡처로 / 문자 붙여넣기' 버튼(불러오기 화면과 따로 두어 첫 화면을 가볍게). */
export function ImportButtons({ onPick }: { onPick: (mode: 'image' | 'text') => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => onPick('image')} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-soft text-sm font-semibold text-brand">
        <ImagePlus className="size-5" aria-hidden />
        사진·캡처로
      </button>
      <button type="button" onClick={() => onPick('text')} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-soft text-sm font-semibold text-brand">
        <Plus className="size-5" aria-hidden />
        문자 붙여넣기
      </button>
    </div>
  );
}
