// "🍚식비" 처럼 한 칸에 적은 이름에서 맨 앞 이모지·특수문자를 아이콘으로 떼어 낸다.

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('ko', { granularity: 'grapheme' }) : null;

function firstGrapheme(text: string): string {
  if (!text) return '';
  if (segmenter) {
    for (const { segment } of segmenter.segment(text)) return segment;
  }
  return Array.from(text)[0] ?? '';
}

/** 글자·숫자가 아닌 첫 글자(이모지·★·♥ 등)를 아이콘으로 본다. */
export function splitIconName(text: string): { icon: string | null; name: string } {
  const t = text.trim();
  const g = firstGrapheme(t);
  if (g && !/^[\p{L}\p{N}\s(（[]/u.test(g)) {
    const rest = t.slice(g.length).trim();
    if (rest) return { icon: g, name: rest };
  }
  return { icon: null, name: t };
}

/** 편집 칸에 넣을 한 줄: 아이콘 + 이름(띄어 쓰지 않음). */
export function joinIconName(icon: string | null | undefined, name: string): string {
  return `${icon ?? ''}${name}`;
}
