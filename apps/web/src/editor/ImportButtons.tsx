import { MessageSquareText } from 'lucide-react';

/** 홈의 '문자 붙여넣기' 버튼. 사진·카메라는 + 메뉴에 있다. */
export function ImportButtons({ onPick }: { onPick: (mode: 'image' | 'text') => void }) {
  return (
    <button type="button" onClick={() => onPick('text')} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-soft text-sm font-semibold text-brand">
      <MessageSquareText className="size-5" aria-hidden />
      문자 붙여넣기
    </button>
  );
}
