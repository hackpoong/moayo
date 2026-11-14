import { MonitorSmartphone, X } from 'lucide-react';
import { useState } from 'react';
import { useInstall } from '../lib/install.ts';
import { readJson, writeJson } from '../lib/storage.ts';
import { Button } from './ui.tsx';

const DISMISS_KEY = 'moayo.installDismissed';

/** 브라우저 탭으로 쓰고 있을 때만 보이는 '앱으로 설치' 안내. */
export function InstallPrompt() {
  const { canPrompt, standalone, prompt } = useInstall();
  const [dismissed, setDismissed] = useState(() => readJson<boolean>(DISMISS_KEY) === true);
  const [showHelp, setShowHelp] = useState(false);
  if (standalone || dismissed) return null;

  const dismiss = () => {
    writeJson(DISMISS_KEY, true);
    setDismissed(true);
  };

  return (
    <section className="rounded-2xl bg-brand-soft p-4">
      <div className="flex items-start gap-3">
        <MonitorSmartphone className="mt-0.5 size-6 shrink-0 text-brand" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">앱으로 설치하면 더 편해요</p>
          <p className="mt-0.5 text-sm text-muted">홈 화면 아이콘으로 열리고, 주소창·아래 막대 없이 전체 화면으로 씁니다.</p>
        </div>
        <button type="button" aria-label="안내 닫기" onClick={dismiss} className="press -m-1 rounded-full p-1 text-muted">
          <X className="size-5" aria-hidden />
        </button>
      </div>
      {showHelp ? (
        <ul className="mt-3 list-disc space-y-1 pl-9 text-sm">
          <li>
            크롬: 오른쪽 위 <b>⋮</b> → <b>앱 설치</b>(또는 <b>홈 화면에 추가</b>)
          </li>
          <li>
            삼성 인터넷: 아래 <b>≡</b> → <b>현재 페이지 추가</b> → <b>홈 화면</b>
          </li>
        </ul>
      ) : null}
      <div className="mt-3 flex gap-2 pl-9">
        {canPrompt ? (
          <Button className="h-10 text-sm" onClick={() => void prompt()}>
            설치하기
          </Button>
        ) : (
          <Button variant="secondary" className="h-10 bg-surface text-sm" onClick={() => setShowHelp((v) => !v)}>
            설치 방법 보기
          </Button>
        )}
      </div>
    </section>
  );
}
