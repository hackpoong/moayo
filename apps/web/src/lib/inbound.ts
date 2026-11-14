import { useEffect } from 'react';
import type { ToastInput } from '../components/toastContext.ts';
import type { EditorRequest } from '../editor/editorContext.ts';

/** '공유 → 모아요'로 들어왔으면(/?share=…) 서비스워커가 넣어 둔 사진·글을 꺼내 자동 입력을 연다. */
export function useSharedInbox(open: (req: EditorRequest) => void): void {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const kind = params.get('share');
    if (!kind || !('caches' in window)) return;
    params.delete('share');
    const rest = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
    void (async () => {
      const cache = await caches.open('moayo-share');
      const keys = await cache.keys();
      const files: File[] = [];
      let text = '';
      for (const req of keys) {
        const res = await cache.match(req);
        if (!res) continue;
        if (req.url.endsWith('/__share/text')) text = await res.text();
        else {
          const blob = await res.blob();
          const name = decodeURIComponent(res.headers.get('x-file-name') ?? 'shared.jpg');
          files.push(new File([blob], name, { type: blob.type || 'image/jpeg' }));
        }
        await cache.delete(req);
      }
      if (files.length) open({ importMode: 'image', files });
      else if (text) open({ importMode: 'text', text });
    })();
  }, [open]);
}

/** 카드·은행 결제 문자처럼 보이는지. */
export function looksLikePaymentText(t: string): boolean {
  return t.length < 2000 && /\d[\d,]*\s*원/.test(t) && /(승인|결제|사용|출금|입금|이체|카드|체크|일시불|할부)/.test(t);
}

const SEEN_KEY = 'moayo:clipboardSeen';

/**
 * 앱으로 돌아왔을 때 클립보드에 결제 문자가 있으면 '넣을까요?'를 띄운다.
 * 클립보드 읽기 권한이 이미 허용된 경우에만 조용히 읽는다(처음에는 문자 넣기 화면의 '붙여넣기'로 허용).
 */
export function useClipboardOffer(open: (req: EditorRequest) => void, toast: (t: ToastInput) => void): void {
  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (document.visibilityState !== 'visible' || !navigator.clipboard?.readText) return;
      try {
        const perm = await navigator.permissions?.query({ name: 'clipboard-read' as PermissionName });
        if (perm?.state !== 'granted') return;
        const text = (await navigator.clipboard.readText()).trim();
        if (!alive || !text || !looksLikePaymentText(text)) return;
        let seen: string | null = null;
        try {
          seen = localStorage.getItem(SEEN_KEY);
        } catch {
          // 저장소를 못 쓰면 매번 묻는다.
        }
        if (seen === text) return;
        try {
          localStorage.setItem(SEEN_KEY, text);
        } catch {
          // 무시
        }
        toast({ message: '복사한 결제 문자를 넣을까요?', action: { label: '넣기', onClick: () => open({ importMode: 'text', text }) }, ms: 7000 });
      } catch {
        // 권한 질의나 읽기를 지원하지 않는 브라우저
      }
    };
    void check();
    document.addEventListener('visibilitychange', check);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', check);
    };
  }, [open, toast]);
}
