// 안드로이드 '공유 → 모아요': 공유된 사진·글을 잠깐 캐시에 넣고 앱을 연다.
// 앱은 /?share=… 로 열리면 캐시에서 꺼내 자동 입력을 시작한다.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.pathname !== '/share-target') return;
  event.respondWith(
    (async () => {
      const form = await event.request.formData();
      const cache = await caches.open('moayo-share');
      for (const key of await cache.keys()) await cache.delete(key);
      const files = form.getAll('images').filter((f) => f && typeof f !== 'string');
      let i = 0;
      for (const f of files) {
        await cache.put(
          `/__share/${i}`,
          new Response(f, { headers: { 'content-type': f.type || 'image/jpeg', 'x-file-name': encodeURIComponent(f.name || `공유 사진 ${i + 1}`) } }),
        );
        i += 1;
      }
      const text = ['title', 'text', 'url']
        .map((k) => form.get(k))
        .filter((v) => typeof v === 'string' && v.trim())
        .join('\n');
      if (text) await cache.put('/__share/text', new Response(text));
      return Response.redirect(`/?share=${files.length ? 'image' : 'text'}`, 303);
    })(),
  );
});
