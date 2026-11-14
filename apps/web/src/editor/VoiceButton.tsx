import { Mic } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { haptic } from '../lib/flash.ts';

// 브라우저 음성 인식(크롬). 타입 정의가 표준에 없어서 필요한 만큼만 적는다.
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** 🎙 누르고 말하면 한 문장을 받아 onText 로 넘긴다. 음성 인식이 없는 브라우저에서는 숨긴다. */
export function VoiceButton({ onText }: { onText: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const finalText = useRef('');
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);
  useEffect(() => () => rec.current?.abort(), []);

  const Ctor = recognitionCtor();
  if (!Ctor) return null;

  const start = () => {
    haptic(10);
    setError(null);
    setHeard('');
    finalText.current = '';
    const r = new Ctor();
    r.lang = 'ko-KR';
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      let text = '';
      let done = '';
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i]!;
        text += res[0]!.transcript;
        if (res.isFinal) done += res[0]!.transcript;
      }
      setHeard(text);
      if (done) finalText.current = done;
    };
    r.onerror = (e) => setError(e.error === 'not-allowed' ? '마이크 권한을 허용해 주세요.' : '잘 듣지 못했어요. 다시 말해 주세요.');
    r.onend = () => {
      setListening(false);
      const text = finalText.current.trim();
      if (text) onTextRef.current(text);
    };
    rec.current = r;
    setListening(true);
    r.start();
  };

  return (
    <>
      <button type="button" aria-label="말로 넣기" onClick={start} className="press flex size-11 items-center justify-center rounded-full text-muted">
        <Mic className="size-6" aria-hidden />
      </button>
      {listening || error
        ? createPortal(
            <div className="backdrop-in fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-[calc(env(safe-area-inset-top)+4rem)]" onClick={() => (listening ? rec.current?.stop() : setError(null))}>
              <div className="w-full max-w-sm rounded-2xl bg-fg px-5 py-4 text-bg shadow-xl">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  {listening ? <span className="size-2.5 animate-pulse rounded-full bg-expense" aria-hidden /> : null}
                  {listening ? '듣고 있어요 · 예: 맥도날드 오천원 현대카드' : error}
                </p>
                {heard ? <p className="mt-2 text-lg">{heard}</p> : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
