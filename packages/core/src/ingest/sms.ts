// 결제·입출금 문자를 규칙으로 읽는다. 확실할 때만 결과를 내고, 아니면 null(→ AI 로 넘김).
// 카드사·은행마다 문구가 조금씩 다르지만 '카드사 + 승인/취소 + 금액 + 날짜·시각 + 가맹점' 뼈대는 같다.

import type { Extraction, ExtractedItem } from './types.ts';

const ISSUERS = [
  'KB국민', '국민', '신한', '현대', '삼성', '롯데', '하나', '우리', 'NH농협', '농협', 'NH', 'BC', '비씨', '씨티', 'IBK', '기업',
  '카카오뱅크', '토스뱅크', '케이뱅크', '수협', '광주', '전북', '경남', '부산', '대구', 'iM', 'DGB', '우체국', '새마을', '신협',
];
const ISSUER_RE = new RegExp(`(${ISSUERS.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(카드|은행|뱅크)?`);

const AMOUNT_RE = /([\d,]{1,15})\s*원/;
const DATETIME_RE = /(\d{1,2})[/.-](\d{1,2})\s*(\d{1,2}):(\d{2})/;
const LAST4_RE = /(?:\((\d{4})\)|(\d{4})\s*(?:승인|취소)|[*＊](\d{3,4}))/;
const NOISE_LINE = /(Web발신|누적|잔액|한도|이용가능|승인|취소|일시불|개월|\d[\d,]*\s*원|님$|^\[.*\]$|^\d{1,2}[/.-]\d{1,2})/;

function inferYear(month: number, day: number, today: string): string {
  const year = Number(today.slice(0, 4));
  const candidate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  // 오늘보다 미래면 작년 문자로 본다(연말·연초 경계).
  return candidate > today ? `${year - 1}${candidate.slice(4)}` : candidate;
}

function baseItem(): ExtractedItem {
  return {
    date: null,
    time: null,
    merchant: '',
    amount: 0,
    original_amount: null,
    kind: 'expense',
    status: 'approved',
    payment_label: null,
    card_last4: null,
    approval_no: null,
    greyed: false,
    foreign_currency: null,
    foreign_amount: null,
    installment_months: null,
    memo: null,
    line_items: [],
    category_hint: null,
  };
}

export function parseSms(raw: string, today: string): Extraction | null {
  const text = raw.replace(/\r/g, '').trim();
  if (!text || text.length > 1000) return null;
  const amount = AMOUNT_RE.exec(text);
  const dt = DATETIME_RE.exec(text);
  const issuer = ISSUER_RE.exec(text);
  if (!amount || !dt || !issuer) return null;

  const item = baseItem();
  item.amount = Number(amount[1]!.replace(/,/g, ''));
  if (!item.amount) return null;
  item.date = inferYear(Number(dt[1]), Number(dt[2]), today);
  item.time = `${dt[3]!.padStart(2, '0')}:${dt[4]}`;

  const isDeposit = /입금/.test(text);
  const isWithdraw = /출금|이체/.test(text) && !/승인/.test(text);
  const isCard = /승인|카드/.test(text) && !isDeposit && !isWithdraw;
  if (!isCard && !isDeposit && !isWithdraw) return null;

  const last4 = LAST4_RE.exec(text);
  item.card_last4 = last4 ? (last4[1] ?? last4[2] ?? last4[3] ?? null) : null;
  if (item.card_last4 && item.card_last4.length < 4) item.card_last4 = null;
  if (/취소/.test(text)) item.status = 'canceled';
  const inst = /(\d{1,2})\s*개월/.exec(text);
  if (inst) item.installment_months = Number(inst[1]);

  const issuerName = issuer[1]!.replace(/^KB국민$/, '국민');
  if (isCard) {
    item.payment_label = `${issuerName}카드${item.card_last4 ? ` ${item.card_last4}` : ''}`;
  } else {
    item.payment_label = `${issuerName}${issuer[2] === '뱅크' ? '뱅크' : '은행'} 계좌`;
    item.kind = isDeposit ? 'income' : 'expense';
  }

  // 가맹점(또는 보낸·받은 사람): 잡음 줄을 빼고 남은 첫 줄. 한 줄짜리 문자는 시각 뒤 글자.
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  let merchant: string;
  if (lines.length > 1) {
    const afterDt = lines.findIndex((l) => DATETIME_RE.test(l));
    const sameLineRest = afterDt >= 0 ? lines[afterDt]!.slice(lines[afterDt]!.search(DATETIME_RE) + dt[0].length).trim() : '';
    const pool = [sameLineRest, ...lines.slice(afterDt + 1), ...lines.slice(0, Math.max(0, afterDt))];
    merchant =
      pool.find((l) => l && !NOISE_LINE.test(l) && !ISSUER_RE.test(l.replace(/\s/g, '')) && /[가-힣A-Za-z]/.test(l)) ??
      pool.find((l) => l && !NOISE_LINE.test(l) && /[가-힣A-Za-z]/.test(l)) ??
      '';
  } else {
    merchant = text.slice(text.search(DATETIME_RE) + dt[0].length).replace(/(누적|잔액).*$/, '').trim();
  }
  merchant = merchant.replace(/^(입금|출금|이체)\s*/, '').replace(/\s*(입금|출금)$/, '').trim();
  if (!merchant || merchant.length > 40) return null;
  item.merchant = merchant;
  return { source_kind: 'sms', items: [item] };
}
