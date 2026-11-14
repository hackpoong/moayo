// 음성 입력 해석: "맥도날드 오천원 현대카드" → 제목·금액·자산. AI 를 부르지 않는다.

import type { PaymentMethod } from './types.ts';

const DIGIT: Record<string, number> = { 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 };
const SMALL: Record<string, number> = { 십: 10, 백: 100, 천: 1000 };
const BIG: Record<string, number> = { 만: 10_000, 억: 100_000_000 };

/** "만 이천 오백", "3만5천", "12,500" 같은 금액 읽기. 읽을 수 없으면 null. */
export function parseKoreanNumber(text: string): number | null {
  const s = text.replace(/[\s,]/g, '');
  if (!s) return null;
  let total = 0;
  let section = 0;
  let current = 0;
  let seen = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9]/.test(s[j]!)) j++;
      current = Number(s.slice(i, j));
      i = j - 1;
      seen = true;
    } else if (ch in DIGIT) {
      current = DIGIT[ch]!;
      seen = true;
    } else if (ch in SMALL) {
      section += (current || 1) * SMALL[ch]!;
      current = 0;
      seen = true;
    } else if (ch in BIG) {
      section += current;
      total += (section || 1) * BIG[ch]!;
      section = 0;
      current = 0;
      seen = true;
    } else return null;
  }
  return seen ? total + section + current : null;
}

const AMOUNT = /((?:[0-9][0-9,]*|[일이삼사오육칠팔구십백천만억])(?:[0-9,]|\s(?=[0-9일이삼사오육칠팔구십백천만억])|[일이삼사오육칠팔구십백천만억])*)\s*원/;
const PARTICLE = /^(으로|로|에서|결제|카드로|사용|썼어|씀)+/;

export interface SpokenEntry {
  title: string;
  amount: number | null;
  paymentMethodId: string | null;
}

/** 말한 문장을 제목·금액·자산으로 나눈다. */
export function parseSpokenEntry(text: string, methods: readonly Pick<PaymentMethod, 'id' | 'name' | 'aliases' | 'archived' | 'deleted_at'>[]): SpokenEntry {
  let rest = ` ${text.trim()} `;
  let amount: number | null = null;
  const m = AMOUNT.exec(rest);
  if (m) {
    const n = parseKoreanNumber(m[1]!);
    if (n && n > 0) {
      amount = n;
      rest = rest.slice(0, m.index) + ' ' + rest.slice(m.index + m[0].length);
    }
  }
  let paymentMethodId: string | null = null;
  const compact = (s: string) => s.replace(/\s/g, '').toLowerCase();
  let best: { id: string; len: number; start: number; end: number } | null = null;
  const live = methods.filter((p) => !p.archived && !p.deleted_at);
  const flat = compact(rest);
  for (const p of live) {
    for (const key of [p.name, ...(p.aliases ?? [])]) {
      const k = compact(key);
      if (k.length < 2) continue;
      const at = flat.indexOf(k);
      if (at >= 0 && (!best || k.length > best.len)) best = { id: p.id, len: k.length, start: at, end: at + k.length };
    }
  }
  if (best) {
    paymentMethodId = best.id;
    // 띄어쓰기를 무시하고 찾았으니, 원래 문자열에서 같은 글자 범위를 지운다.
    let count = 0;
    let from = -1;
    let to = -1;
    for (let i = 0; i < rest.length; i++) {
      if (/\s/.test(rest[i]!)) continue;
      if (count === best.start) from = i;
      count++;
      if (count === best.end) {
        to = i + 1;
        break;
      }
    }
    if (from >= 0 && to > from) rest = rest.slice(0, from) + ' ' + rest.slice(to).replace(/^\s*/, '').replace(PARTICLE, '');
  }
  const title = rest.replace(/\s+/g, ' ').trim().replace(/(에서|으로|로)$/, '').trim();
  return { title, amount, paymentMethodId };
}
