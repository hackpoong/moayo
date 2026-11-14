// AI 가 돌려준 JSON 을 믿지 않고 모양을 맞춘다. 업체마다 조금씩 다르게 틀린다.

import type { ExtractedItem, ExtractedLine, ExtractedTender, Extraction, SourceKind, TenderKind } from './types.ts';

const SOURCE_KINDS: SourceKind[] = ['toss_list', 'local_currency_app', 'receipt', 'card_statement', 'pay_history', 'bank_app', 'sms', 'push', 'other'];

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const int = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[^\d.-]/g, '')) : NaN;
  return Number.isFinite(n) ? Math.round(Math.abs(n)) : null;
};
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[^\d.-]/g, '')) : NaN;
  return Number.isFinite(n) ? Math.abs(n) : null;
};
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback);

export function coerceExtraction(raw: unknown): Extraction {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const items = Array.isArray(obj.items) ? obj.items : [];
  return {
    source_kind: oneOf(obj.source_kind, SOURCE_KINDS, 'other'),
    items: items.map(coerceItem).filter((i): i is ExtractedItem => i !== null),
  };
}

function coerceItem(raw: unknown): ExtractedItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const amount = int(o.amount);
  const merchant = str(o.merchant);
  if (!amount || !merchant) return null;
  const date = str(o.date);
  const time = str(o.time);
  const lines = Array.isArray(o.line_items) ? o.line_items : [];
  return {
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    time: time && /^\d{1,2}:\d{2}/.test(time) ? time.slice(0, 5).padStart(5, '0') : null,
    merchant,
    amount,
    original_amount: int(o.original_amount),
    // 이체 여부는 규칙(회색 표시·충전·내 계좌 이체·이체 규칙)이 정한다. AI 는 방향만.
    kind: o.kind === 'income' ? 'income' : 'expense',
    status: oneOf(o.status, ['approved', 'canceled', 'partial_canceled', 'declined'] as const, 'approved'),
    payment_label: str(o.payment_label),
    card_last4: last4Only(o.card_last4),
    card_number_hint: str(o.card_number_hint)?.slice(0, 40) ?? null,
    approval_no: str(o.approval_no),
    greyed: o.greyed === true,
    foreign_currency: str(o.foreign_currency),
    foreign_amount: num(o.foreign_amount),
    installment_months: int(o.installment_months),
    memo: str(o.memo),
    line_items: lines
      .map((l): ExtractedLine | null => {
        const x = (l && typeof l === 'object' ? l : {}) as Record<string, unknown>;
        const name = str(x.name);
        const a = int(x.amount);
        return name && a !== null ? { name, amount: a, quantity: int(x.quantity) } : null;
      })
      .filter((l): l is ExtractedLine => l !== null),
    category_hint: str(o.category_hint),
    emoji: emojiOnly(o.emoji),
    tenders: (Array.isArray(o.tenders) ? o.tenders : [])
      .map((t): ExtractedTender | null => {
        const x = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
        const a = int(x.amount);
        if (!a) return null;
        return {
          kind: oneOf(x.kind, ['card', 'cash', 'point', 'voucher', 'other'] as const, 'other') as TenderKind,
          label: str(x.label),
          amount: a,
          card_number_hint: str(x.card_number_hint)?.slice(0, 40) ?? null,
          holder: str(x.holder)?.slice(0, 20) ?? null,
        };
      })
      .filter((t): t is ExtractedTender => t !== null)
      .slice(0, 6),
  };
}

/** 끝 4자리가 모두 숫자로 보일 때만('493*' 처럼 가려졌으면 버린다). */
function last4Only(v: unknown): string | null {
  const s = str(v)?.replace(/[\s-]/g, '');
  if (!s) return null;
  const tail = s.slice(-4);
  return /^\d{4}$/.test(tail) ? tail : null;
}

/** JSON 스키마의 type: [x, 'null'] 를 anyOf 로 바꾼다(업체마다 지원하는 표기가 달라서). */
export function toAnyOfNullable(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toAnyOfNullable);
  if (!schema || typeof schema !== 'object') return schema;
  const s = { ...(schema as Record<string, unknown>) };
  for (const [k, v] of Object.entries(s)) s[k] = toAnyOfNullable(v);
  if (Array.isArray(s.type) && s.type.includes('null')) {
    const { type, description, ...rest } = s as { type: string[]; description?: string };
    const base = type.find((t) => t !== 'null');
    return { anyOf: [{ type: base, ...rest }, { type: 'null' }], ...(description ? { description } : {}) };
  }
  return s;
}

/** 이모지 한 글자만 받는다(글자·숫자가 섞이면 버림). */
function emojiOnly(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || t.length > 16 || /[\p{L}\p{N}]/u.test(t)) return null;
  return /\p{Extended_Pictographic}|\p{So}/u.test(t) ? t : null;
}
