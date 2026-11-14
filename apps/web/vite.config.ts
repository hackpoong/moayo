import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // React·라우터·Supabase SDK 합이 gzip 약 150KB. PWA가 캐시하므로 첫 설치 뒤에는 다시 받지 않는다.
  build: { chunkSizeWarningLimit: 600 },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '모아요 가계부',
        short_name: '모아요',
        description: '가족이 함께 쓰는 가계부',
        lang: 'ko',
        id: '/',
        scope: '/',
        start_url: '/',
        display: 'standalone',
        display_override: ['standalone'],
        orientation: 'portrait',
        // 상태 표시줄·시작 화면을 앱 배경색과 맞춘다.
        background_color: '#f5f6f8',
        theme_color: '#f5f6f8',
        // 갤러리·메시지 앱에서 '공유 → 모아요'로 사진·글을 바로 넘긴다.
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { title: 'title', text: 'text', url: 'url', files: [{ name: 'images', accept: ['image/*'] }] },
        },
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 앱 껍데기를 통째로 캐시해서 다시 열 때 네트워크를 기다리지 않는다.
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        navigateFallback: '/index.html',
        importScripts: ['share-target.js'],
        // 글꼴은 글자 묶음별로 잘게 나뉘어 있어 필요한 것만 받고, 한 번 받으면 기기에 둔다.
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
});
