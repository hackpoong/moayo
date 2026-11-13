import { X } from 'lucide-react';
import { useEffect } from 'react';

/** 내역 추가 시트. 입력 화면은 다음 단계(P1)에서 들어온다. */
export function AddSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="내역 추가"
        onClick={(e) => e.stopPropagation()}
        className="pb-safe w-full max-w-md rounded-t-3xl bg-surface p-5 md:rounded-3xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">내역 추가</h2>
          <button type="button" aria-label="닫기" onClick={onClose} className="rounded-full p-2 text-muted hover:bg-surface-2">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <p className="py-8 text-center text-muted">
          입력 화면은 다음 단계에서 만듭니다.
          <br />
          금액 키패드, 카테고리, 결제수단 순서로 3번 탭이면 저장되게 할 예정입니다.
        </p>
      </div>
    </div>
  );
}
