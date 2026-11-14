// 홈 화면 설치(PWA). 브라우저가 주는 설치 이벤트는 앱이 뜨기 전에 올 수 있어서, 시작할 때 미리 잡아 둔다.

import { useSyncExternalStore } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function listenForInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    notify();
  });
}

/** 이미 설치한 앱으로 열렸는지(주소창 없는 전체 화면). */
export function isStandalone(): boolean {
  return (
    installed ||
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function useInstall(): { canPrompt: boolean; standalone: boolean; prompt: () => Promise<boolean> } {
  const snapshot = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => `${!!deferred}|${installed}`,
  );
  void snapshot;
  return {
    canPrompt: !!deferred,
    standalone: isStandalone(),
    async prompt() {
      if (!deferred) return false;
      const event = deferred;
      deferred = null;
      notify();
      await event.prompt();
      const { outcome } = await event.userChoice;
      return outcome === 'accepted';
    },
  };
}
