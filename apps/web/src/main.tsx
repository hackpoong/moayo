import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './index.css';
import { AuthProvider } from './lib/auth.tsx';
import { listenForInstall } from './lib/install.ts';

listenForInstall();

// iOS Safari 는 viewport 의 확대 금지를 무시하므로 두 손가락 확대 제스처를 직접 막는다(사진 보기는 자체 확대).
for (const type of ['gesturestart', 'gesturechange'] as const) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
