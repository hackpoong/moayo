// 카드 등록 도우미: 번호 검사(Luhn)·표시, 유효기간, 사진으로 카드를 읽는 AI 지시와 결과 다듬기.

const nullable = (type: string) => ({ type: [type, 'null'] });

/** 카드번호 숫자만. */
export function cardDigits(text: string): string {
  return text.replace(/\D/g, '');
}

/** Luhn 검사(카드번호 끝자리 검증). 13~19자리만 카드번호로 본다. */
export function luhnValid(number: string): boolean {
  const d = cardDigits(number);
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

/** 4자리씩 띄워 쓰기(아멕스 15자리는 4-6-5). */
export function formatCardNumber(number: string): string {
  const d = cardDigits(number);
  if (d.length === 15 && /^3[47]/.test(d)) return `${d.slice(0, 4)} ${d.slice(4, 10)} ${d.slice(10)}`;
  return d.replace(/(.{4})/g, '$1 ').trim();
}

/** 가린 번호: 앞 4자리와 끝 4자리만. */
export function maskCardNumber(number: string): string {
  const d = cardDigits(number);
  if (d.length < 8) return '•'.repeat(d.length);
  return (d.slice(0, 4) + '•'.repeat(d.length - 8) + d.slice(-4)).replace(/(.{4})/g, '$1 ').trim();
}

/** "08/29", "0829", "08-2029" → "08/29". 이상하면 null. */
export function normalizeExpiry(text: string | null | undefined): string | null {
  const m = /^\s*(\d{1,2})\s*[/.\- ]?\s*(\d{2}|\d{4})\s*$/.exec(text ?? '');
  if (!m) return null;
  const month = Number(m[1]);
  if (month < 1 || month > 12) return null;
  return `${String(month).padStart(2, '0')}/${m[2]!.slice(-2)}`;
}

export function normalizeCvc(text: string | null | undefined): string | null {
  const d = cardDigits(text ?? '');
  return d.length === 3 || d.length === 4 ? d : null;
}

/**
 * 결제일로 흔한 이용기간 시작일을 짐작한다(국내 카드사 대부분: 결제일 14일 → 전월 1일~말일,
 * 25일 → 전월 12일~당월 11일, 1일 → 전전월 18일~전월 17일). 카드사마다 하루 이틀 다를 수 있다.
 */
export function typicalStartDay(paymentDay: number): number {
  const s = paymentDay - 13;
  return s <= 0 ? s + 30 : s;
}

export const CARD_TYPES_FOR_SCAN = ['credit_card', 'check_card', 'prepaid_card'] as const;
export type ScannedCardType = (typeof CARD_TYPES_FOR_SCAN)[number];

export interface ScannedCard {
  issuer: string | null;
  product_name: string | null;
  type: ScannedCardType | null;
  network: string | null;
  number: string | null;
  expiry: string | null;
  cvc: string | null;
  emoji: string | null;
  color: string | null;
  sms_aliases: string[];
  bank_hint: string | null;
  benefits: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export const CARD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['issuer', 'product_name', 'type', 'network', 'number', 'expiry', 'cvc', 'emoji', 'color', 'sms_aliases', 'bank_hint', 'benefits', 'confidence'],
  properties: {
    issuer: { ...nullable('string'), description: '카드사(예: 현대카드, 신한카드, KB국민카드)' },
    product_name: { ...nullable('string'), description: '카드 상품 이름(예: 현대카드 M, 신한카드 Deep Dream)' },
    type: { type: ['string', 'null'], enum: ['credit_card', 'check_card', 'prepaid_card'] },
    network: { ...nullable('string'), description: 'VISA, Mastercard, AMEX, JCB, UnionPay, BC, 국내전용 등' },
    number: { ...nullable('string'), description: '카드번호 숫자만' },
    expiry: { ...nullable('string'), description: '유효기간 MM/YY' },
    cvc: { ...nullable('string'), description: '뒷면 서명란 옆 3자리(아멕스는 앞면 4자리)' },
    emoji: { ...nullable('string'), description: '이 카드에 어울리는 이모지 1개' },
    color: { ...nullable('string'), description: '카드 앞면의 대표 색 #RRGGBB' },
    sms_aliases: { type: 'array', items: { type: 'string' }, description: '결제 문자·알림에 이 카드가 표시되는 이름들' },
    bank_hint: { ...nullable('string'), description: '체크카드면 연결된 은행 이름' },
    benefits: { ...nullable('string'), description: '널리 알려진 주요 혜택 1~3줄 요약(모르면 null)' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: '카드 상품을 맞혔다고 얼마나 확신하는지' },
  },
} as const;

export const CARD_SYSTEM_PROMPT = `너는 한국 신용카드·체크카드 사진을 읽어 가계부 앱의 '자산' 칸을 채우는 도우미다.
사용자 본인의 카드를 본인 가계부에 등록하는 것이며, 읽은 번호는 사용자 기기에서 암호화되어 보관된다.

읽기
- 카드번호, 유효기간(MM/YY), CVC 는 사진에 보이는 그대로 옮긴다. 보이지 않거나 흐리면 null. 추측해서 채우지 않는다.
- 사진이 앞면·뒷면 두 장일 수 있다. CVC 는 뒷면 서명란 옆 3자리(아멕스는 앞면 4자리).

추론(사진에 글자로 없어도 된다)
- 로고·색·무늬·글씨체·카드 앞 6자리(BIN)로 카드사와 상품을 알아낸다. 예: 검은 무광에 M 로고 → 현대카드 M.
- type: 'CHECK'·'체크'·'DEBIT' 이 보이거나 은행 체크카드 디자인이면 check_card, 선불·기프트면 prepaid_card, 나머지는 credit_card.
- sms_aliases: 결제 문자·앱 알림에서 이 카드를 부르는 이름(예: ["현대카드", "현대"], ["신한카드", "신한"], ["KB국민카드", "국민"]).
- bank_hint: 체크카드면 연결 은행(예: 신한은행, 국민은행). 아니면 null.
- benefits: 그 상품의 널리 알려진 대표 혜택을 짧게(1~3줄, 줄바꿈으로 구분). 확실하지 않으면 null.
- confidence: 상품까지 확실하면 high, 카드사만 확실하면 medium, 둘 다 불확실하면 low.
- 카드가 아니면 모두 null, confidence 는 low.`;

const str = (v: unknown, max = 60): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** AI 결과를 믿을 수 있는 모양으로 다듬는다. 틀린 번호·유효기간·CVC 는 버린다. */
export function coerceScannedCard(raw: unknown): ScannedCard {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const number = str(o.number, 40);
  const digits = number ? cardDigits(number) : '';
  const type = CARD_TYPES_FOR_SCAN.includes(o.type as ScannedCardType) ? (o.type as ScannedCardType) : null;
  const color = typeof o.color === 'string' && /^#[0-9a-f]{6}$/i.test(o.color) ? o.color.toLowerCase() : null;
  const emoji = typeof o.emoji === 'string' && /^\p{Extended_Pictographic}/u.test(o.emoji.trim()) ? [...new Intl.Segmenter().segment(o.emoji.trim())][0]!.segment : null;
  return {
    issuer: str(o.issuer, 30),
    product_name: str(o.product_name, 30),
    type,
    network: str(o.network, 20),
    number: digits.length >= 13 && digits.length <= 19 ? digits : null,
    expiry: normalizeExpiry(str(o.expiry, 10)),
    cvc: normalizeCvc(str(o.cvc, 6)),
    emoji,
    color,
    sms_aliases: Array.isArray(o.sms_aliases) ? [...new Set(o.sms_aliases.map((a) => str(a, 20)).filter((a): a is string => !!a))].slice(0, 6) : [],
    bank_hint: str(o.bank_hint, 20),
    benefits: str(o.benefits, 300),
    confidence: o.confidence === 'high' || o.confidence === 'medium' ? o.confidence : 'low',
  };
}

const MASK = /[*xX•●＊#]/;

/** 문구에서 카드번호 같은 덩어리(숫자·가림표, 사이 '-'·공백)를 꺼낸다. 가림표는 '*' 로 바꾼다. */
export function cardNumberTokens(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const m of text.matchAll(/[0-9*xX•●＊#](?:[0-9*xX•●＊#]|[-\s](?=[0-9*xX•●＊#])){3,}/g)) {
    const token = m[0].replace(/[-\s]/g, '').replace(new RegExp(MASK.source, 'g'), '*');
    // '11/14 14:02' 같은 숫자가 띄어쓰기로 붙지 않게, 띄어 쓴 덩어리는 카드번호 길이(12자 이상)일 때만.
    if (/[-\s]/.test(m[0]) && token.length < 12) continue;
    if ((token.match(/\d/g) ?? []).length >= 3) out.push(token);
  }
  return out;
}

/** 덩어리 하나가 카드번호(또는 끝 4자리)와 맞는지. */
function tokenMatches(token: string, number: string | null, last4: string | null): boolean {
  const masked = token.includes('*');
  const lead = /^\d*/.exec(token)![0];
  const tail = /\d*$/.exec(token)![0];
  if (number) {
    if (token.length === number.length) return [...token].every((c, i) => c === '*' || c === number[i]);
    if (masked) return (lead + tail).length >= 3 && (!lead || number.startsWith(lead)) && (!tail || number.endsWith(tail));
    // 숫자만: 4자리는 끝자리, 6자리는 앞자리(카드사 번호)
    if (token.length === 4) return number.endsWith(token);
    if (token.length === 6) return number.startsWith(token);
    return false;
  }
  if (!last4) return false;
  if (masked) return tail.length >= 3 && last4.endsWith(tail.slice(-4));
  return token.length === 4 && token === last4;
}

/**
 * 문자·알림·캡처에 찍힌 카드번호가 이 카드인지. 어떤 모양이든 맞춘다:
 * '1234', '(1234)', '*1234', '411111', '4111-11**-****-1111', '411111******1111'.
 * 카드번호 전체가 없으면 끝 4자리로만 본다.
 */
export function cardHintMatches(hint: string | null | undefined, number: string | null | undefined, last4: string | null | undefined): boolean {
  const n = number ? cardDigits(number) : null;
  const l4 = last4 && /^\d{4}$/.test(last4) ? last4 : n ? n.slice(-4) : null;
  return cardNumberTokens(hint).some((t) => tokenMatches(t, n || null, l4));
}
