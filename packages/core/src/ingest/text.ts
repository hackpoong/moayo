// 가맹점 이름 비교용 정규화와 유사도.

const NOISE = /(주식회사|\(주\)|㈜|\(유\)|유한회사|\s|[()[\]{}.,·\-_/'"])/g;

/** 이모지·기호(🍔, ♨️, ★ 등)는 이름 비교에서 뺀다. 제목 앞에 이모지를 붙여도 같은 가게로 본다. */
const SYMBOLS = /\p{Extended_Pictographic}|\p{So}|\p{Emoji_Modifier}|\u{FE0F}|\u{200D}|\u{20E3}/gu;

export function normalizeMerchant(name: string | null | undefined): string {
  return (name ?? '').toLowerCase().replace(SYMBOLS, '').replace(NOISE, '');
}

function bigrams(s: string): string[] {
  if (s.length < 2) return s ? [s] : [];
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

/** 0~1. 한쪽이 다른 쪽을 포함하면(‘이마트’ ⊂ ‘이마트세종점’) 높게 본다. */
export function merchantSimilarity(a: string | null | undefined, b: string | null | undefined): number | null {
  const x = normalizeMerchant(a);
  const y = normalizeMerchant(b);
  if (!x || !y) return null;
  if (x === y) return 1;
  if (x.length >= 2 && y.length >= 2 && (x.includes(y) || y.includes(x))) return 0.85;
  const bx = bigrams(x);
  const by = bigrams(y);
  const counts = new Map<string, number>();
  for (const g of bx) counts.set(g, (counts.get(g) ?? 0) + 1);
  let common = 0;
  for (const g of by) {
    const n = counts.get(g) ?? 0;
    if (n > 0) {
      common += 1;
      counts.set(g, n - 1);
    }
  }
  return (2 * common) / (bx.length + by.length);
}

/**
 * 네이버페이·카카오페이처럼 다른 결제수단을 감싸는 '페이' 이름인지.
 * 같은 결제가 페이 앱에는 실제 가게·상품 이름으로, 카드·토스에는 결제대행사 이름으로 찍혀서 이름으로는 맞출 수 없다.
 */
export function isWrapperLabel(label: string | null | undefined): boolean {
  return !!label && /(네이버\s*페이|naver\s*pay|n\s*pay|카카오\s*페이|kakao\s*pay|토스\s*페이|toss\s*pay|페이코|payco|스마일\s*페이|쿠페이|삼성\s*페이|애플\s*페이)/i.test(label);
}

/** AI 로 보내기 전에 카드·계좌 번호처럼 긴 숫자는 끝 4자리만 남긴다. */
export function maskSensitive(text: string): string {
  return text.replace(/\d[\d-]{7,}\d/g, (m) => {
    const digits = m.replace(/\D/g, '');
    if (digits.length < 8) return m;
    return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
  });
}
