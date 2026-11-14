// 이모지와 어울리는 원형 배경색: 이모지를 이 기기의 글꼴로 그려 본 뒤 주된 색을 연하게 만든다.
// 갤럭시 폰에서는 삼성 이모지로 그려지므로 그 색에 맞춰진다.

export interface Tint {
  light: string;
  dark: string;
}

const KEY = 'moayo:tint:v1';
const cache = new Map<string, Tint>();
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, Tint>)) cache.set(k, v);
  } catch {
    // 저장소를 못 쓰면 그때그때 계산한다.
  }
}

let saveTimer = 0;
function persist() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      const entries = [...cache.entries()].slice(-400);
      localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch {
      // 무시
    }
  }, 500);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function measure(emoji: string): Tint | null {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${size - 6}px system-ui, sans-serif`;
  ctx.fillText(emoji, size / 2, size / 2 + 1);
  const px = ctx.getImageData(0, 0, size, size).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let w = 0;
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3]! / 255;
    if (a < 0.5) continue;
    const [, s, l] = rgbToHsl(px[i]!, px[i + 1]!, px[i + 2]!);
    // 채도가 높은 픽셀(이모지의 '색')을 크게, 검은 윤곽·흰 반사광은 작게 본다.
    const weight = a * (0.1 + s) * (l > 0.08 && l < 0.95 ? 1 : 0.1);
    r += px[i]! * weight;
    g += px[i + 1]! * weight;
    b += px[i + 2]! * weight;
    w += weight;
  }
  if (w === 0) return null;
  const [h, s] = rgbToHsl(r / w, g / w, b / w);
  const sat = Math.round(Math.min(0.7, s) * 100);
  return {
    light: `hsl(${Math.round(h)} ${Math.max(sat, s > 0.08 ? 35 : 0)}% 92%)`,
    dark: `hsl(${Math.round(h)} ${Math.round(Math.min(sat, 40))}% 22%)`,
  };
}

/** 이모지에 어울리는 연한 배경색(밝은·어두운 화면용). 계산할 수 없으면 null. */
export function emojiTint(emoji: string | null | undefined): Tint | null {
  if (!emoji || typeof document === 'undefined') return null;
  load();
  const hit = cache.get(emoji);
  if (hit) return hit;
  const t = measure(emoji);
  if (t) {
    cache.set(emoji, t);
    persist();
  }
  return t;
}
