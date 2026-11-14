// 이 기기의 사진 캐시(Cache Storage). 경로가 바뀌지 않는 파일이라 한 번 받으면 다시 받지 않는다.

const CACHE = 'moayo-photos-v1';
const cacheKey = (path: string) => `/__photos/${path}`;

export async function rememberPhoto(path: string, blob: Blob): Promise<void> {
  try {
    const cache = await caches.open(CACHE);
    await cache.put(cacheKey(path), new Response(blob, { headers: { 'content-type': blob.type } }));
  } catch {
    // Cache Storage 가 없어도(사생활 보호 모드 등) 동작은 한다.
  }
}

export async function cachedPhoto(path: string): Promise<Blob | null> {
  try {
    const res = await (await caches.open(CACHE)).match(cacheKey(path));
    return res ? await res.blob() : null;
  } catch {
    return null;
  }
}
