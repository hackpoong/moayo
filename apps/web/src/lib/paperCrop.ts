// 바닥에 놓고 찍은 영수증처럼 사진 속 '밝은 종이' 부분을 찾는다.
// 종이만 잘라서 AI 에 보내면 같은 크기(토큰)로 글자가 2~3배 커져 더 잘 읽는다.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SIDE = 240; // 작게 줄여서 본다(빠름)

/** 짧은 끊김(바코드·굵은 글씨 줄 등)은 이어 붙인다. */
function bridge(flags: boolean[], gap: number): boolean[] {
  const out = [...flags];
  let last = -1;
  flags.forEach((on, i) => {
    if (!on) return;
    if (last >= 0 && i - last - 1 <= gap) for (let k = last + 1; k < i; k++) out[k] = true;
    last = i;
  });
  return out;
}

/** 가장 긴 연속 구간 [시작, 끝). */
function longestRun(flags: boolean[]): [number, number] | null {
  let best: [number, number] | null = null;
  let start = -1;
  flags.forEach((on, i) => {
    if (on && start < 0) start = i;
    if ((!on || i === flags.length - 1) && start >= 0) {
      const end = on ? i + 1 : i;
      if (!best || end - start > best[1] - best[0]) best = [start, end];
      start = -1;
    }
  });
  return best;
}

/** 종이 영역(원본 좌표). 찾지 못하거나 사진 대부분이 종이면 null(자르지 않음). */
export function findPaper(source: CanvasImageSource, width: number, height: number): Box | null {
  const scale = SIDE / Math.max(width, height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  // 밝고(종이) 색이 옅은(흰색) 점. 기준은 사진에서 가장 밝은 쪽 10% 근처로 잡는다.
  const lum = new Float32Array(w * h);
  const sat = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4]!;
    const g = data[i * 4 + 1]!;
    const b = data[i * 4 + 2]!;
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    sat[i] = Math.max(r, g, b) - Math.min(r, g, b);
  }
  const sorted = Float32Array.from(lum).sort();
  const threshold = Math.max(150, sorted[Math.floor(sorted.length * 0.85)]! - 10);
  const paper = (i: number) => lum[i]! >= threshold && sat[i]! < 40;

  const colFrac = Array.from({ length: w }, (_, x) => {
    let n = 0;
    for (let y = 0; y < h; y++) if (paper(y * w + x)) n++;
    return n / h;
  });
  const cols = longestRun(bridge(colFrac.map((f) => f > 0.25), Math.round(w * 0.02)));
  if (!cols) return null;
  const rowFrac = Array.from({ length: h }, (_, y) => {
    let n = 0;
    for (let x = cols[0]; x < cols[1]; x++) if (paper(y * w + x)) n++;
    return n / (cols[1] - cols[0]);
  });
  const rows = longestRun(bridge(rowFrac.map((f) => f > 0.4), Math.round(h * 0.04)));
  if (!rows) return null;

  const bw = (cols[1] - cols[0]) / w;
  const bh = (rows[1] - rows[0]) / h;
  const area = bw * bh;
  // 너무 작으면(잘못 찾음) 또는 사진 대부분이 종이면(자를 필요 없음) 그대로 둔다.
  if (area < 0.06 || area > 0.8) return null;
  const mx = Math.round((cols[1] - cols[0]) * 0.04) + 1;
  const my = Math.round((rows[1] - rows[0]) * 0.02) + 1;
  const x0 = Math.max(0, cols[0] - mx);
  const y0 = Math.max(0, rows[0] - my);
  const x1 = Math.min(w, cols[1] + mx);
  const y1 = Math.min(h, rows[1] + my);
  return { x: Math.round(x0 / scale), y: Math.round(y0 / scale), w: Math.round((x1 - x0) / scale), h: Math.round((y1 - y0) / scale) };
}
