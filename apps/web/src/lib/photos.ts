// 내역 사진: 휴대폰에서 줄이고(약 240만 화소 WebP + 작은 썸네일, 위치정보 없음), 기기에 먼저 두었다가 동기화 때 올린다.
// 한 번 받은 사진은 Cache Storage 에 경로로 보관해서 다시 받지 않는다(경로는 바뀌지 않는 파일).

import { MAX_ATTACHMENTS, type Attachment } from '@moayo/core';
import { useEffect, useState } from 'react';
import { useDataContext } from '../data/dataContext.ts';
import type { LocalDb } from '../data/localDb.ts';
import { findPaper, type Box } from './paperCrop.ts';
import { cachedPhoto, rememberPhoto } from './photoCache.ts';
import { db as supabaseClient } from './supabase.ts';

export { MAX_ATTACHMENTS };

export interface Encoded {
  blob: Blob;
  w: number;
  h: number;
}

export interface EncodeOptions {
  /** 짧은 변 상한(px). */
  maxShort?: number;
  /** 전체 화소 상한. 긴 영수증도 폭이 너무 줄지 않게 '긴 변'이 아니라 화소 수로 맞춘다. */
  maxPixels?: number;
  /** 바닥에 놓고 찍은 영수증처럼 배경이 있으면 종이 부분만(여백 넉넉히) 남긴다. */
  cropPaper?: boolean;
}

/** 종이 영역을 잘리지 않게 넉넉히 넓힌다(좌우 각 6%, 위아래 각 3% 더). */
function generous(box: Box, w: number, h: number): Box {
  const mx = Math.round(w * 0.06);
  const my = Math.round(h * 0.03);
  const x = Math.max(0, box.x - mx);
  const y = Math.max(0, box.y - my);
  return { x, y, w: Math.min(w, box.x + box.w + mx) - x, h: Math.min(h, box.y + box.h + my) - y };
}

/**
 * 사진을 줄여 WebP(안 되면 JPEG)로. canvas 로 다시 그리므로 EXIF·위치정보는 남지 않는다.
 * 크기는 긴 변 maxSide, 짧은 변 maxShort, 화소 수 maxPixels 중 가장 작은 쪽에 맞춘다.
 */
export async function encodeImage(file: Blob, maxSide: number, quality: number, opts: EncodeOptions = {}): Promise<Encoded> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const paper = opts.cropPaper ? findPaper(bitmap, bitmap.width, bitmap.height) : null;
    const src = paper ? generous(paper, bitmap.width, bitmap.height) : { x: 0, y: 0, w: bitmap.width, h: bitmap.height };
    const scale = Math.min(
      1,
      maxSide / Math.max(src.w, src.h),
      opts.maxShort ? opts.maxShort / Math.min(src.w, src.h) : 1,
      opts.maxPixels ? Math.sqrt(opts.maxPixels / (src.w * src.h)) : 1,
    );
    const w = Math.max(1, Math.round(src.w * scale));
    const h = Math.max(1, Math.round(src.h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, src.x, src.y, src.w, src.h, 0, 0, w, h);
    const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    let blob = await toBlob('image/webp');
    // WebP 를 못 만드는 브라우저는 PNG 를 돌려준다 → JPEG 로.
    if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg');
    if (!blob) throw new Error('사진을 변환하지 못했습니다.');
    return { blob, w, h };
  } finally {
    bitmap.close();
  }
}

/** 내역 사진 크기: 보통 사진은 약 1800×1350, 긴 영수증은 폭을 살려 약 790×2290(잘라 낸 경우). */
const FULL = { side: 4096, quality: 0.8, maxShort: 1600, maxPixels: 2_400_000 };
const THUMB = { side: 1000, quality: 0.7, maxShort: 360, maxPixels: 200_000 };

const extOf = (b: Blob) => (b.type === 'image/webp' ? 'webp' : 'jpg');

/** 붙일 준비가 된 사진: 메타데이터 + 올릴 파일들. 미리보기는 바로 쓸 수 있다. */
export interface PreparedPhoto {
  attachment: Attachment;
  files: { path: string; blob: Blob }[];
}

export async function preparePhoto(file: Blob, householdId: string, txId: string, opts: { cropPaper?: boolean } = {}): Promise<PreparedPhoto> {
  const [full, thumb] = await Promise.all([
    // 잘라 낸 영수증은 배경이 없으니 화소를 조금 덜 써도 글자가 또렷하다(약 180만 화소).
    encodeImage(file, FULL.side, FULL.quality, { maxShort: FULL.maxShort, maxPixels: opts.cropPaper ? 1_800_000 : FULL.maxPixels, cropPaper: opts.cropPaper }),
    encodeImage(file, THUMB.side, THUMB.quality, { maxShort: THUMB.maxShort, maxPixels: THUMB.maxPixels, cropPaper: opts.cropPaper }),
  ]);
  const id = crypto.randomUUID();
  const path = `${householdId}/${txId}/${id}.${extOf(full.blob)}`;
  const thumbPath = `${householdId}/${txId}/${id}_t.${extOf(thumb.blob)}`;
  memory.set(path, URL.createObjectURL(full.blob));
  memory.set(thumbPath, URL.createObjectURL(thumb.blob));
  return {
    attachment: { id, path, thumb_path: thumbPath, w: full.w, h: full.h, bytes: full.blob.size + thumb.blob.size, created_at: new Date().toISOString() },
    files: [
      { path, blob: full.blob },
      { path: thumbPath, blob: thumb.blob },
    ],
  };
}

/** 저장할 때: 새 사진은 올리기 줄에, 뺀 사진은 지우기 줄에 넣는다(실제 전송은 동기화가 한다). */
export async function queuePhotoChanges(local: LocalDb, householdId: string, added: PreparedPhoto[], removed: Attachment[]): Promise<void> {
  const now = Date.now();
  await local.uploads.bulkPut([
    ...added.flatMap((p) => p.files.map((f) => ({ path: f.path, household_id: householdId, op: 'put' as const, blob: f.blob, type: f.blob.type, queued_at: now, attempts: 0, last_error: null }))),
    ...removed.flatMap((a) => [a.path, a.thumb_path].map((path) => ({ path, household_id: householdId, op: 'delete' as const, blob: null, type: '', queued_at: now, attempts: 0, last_error: null }))),
  ]);
}

const memory = new Map<string, string>();

const inflight = new Map<string, Promise<string | null>>();

/** 사진 주소(object URL). 기기 메모리 → 올리기 대기 → 사진 캐시 → 서버 순서로 찾는다. 아직 서버에 없으면 null. */
export function photoUrl(local: LocalDb, path: string): Promise<string | null> {
  const hit = memory.get(path);
  if (hit) return Promise.resolve(hit);
  let p = inflight.get(path);
  if (!p) {
    p = (async () => {
      const pending = await local.uploads.get(path);
      let blob: Blob | null = pending?.op === 'put' ? pending.blob : null;
      if (!blob) {
        blob = await cachedPhoto(path);
      }
      if (!blob) {
        const { data, error } = await supabaseClient().storage.from('attachments').download(path);
        if (error || !data) return null;
        blob = data;
        await rememberPhoto(path, blob);
      }
      const url = URL.createObjectURL(blob);
      memory.set(path, url);
      return url;
    })().finally(() => inflight.delete(path));
    inflight.set(path, p);
  }
  return p;
}

/** 화면에 사진 하나. 실패하면 잠시 뒤 다시 시도한다(다른 폰이 아직 올리는 중일 수 있다). */
export function usePhotoUrl(path: string | null | undefined): { url: string | null; pending: boolean } {
  const { db: local } = useDataContext();
  const [state, setState] = useState<{ path: string | null; url: string | null }>({ path: null, url: null });
  useEffect(() => {
    if (!path) return;
    let alive = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      void photoUrl(local, path).then((url) => {
        if (!alive) return;
        if (url) setState({ path, url });
        else if (tries++ < 6) timer = setTimeout(load, 4000 * tries);
      });
    };
    load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [local, path]);
  const url = state.path === path ? state.url : (path ? (memory.get(path) ?? null) : null);
  return { url, pending: !!path && !url };
}
