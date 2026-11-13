// 뽑아낸 줄들을 저장할 후보로 정리한다.
//  * 승인거절은 버린다. 취소는 '취소' 상태로 남긴다(합계에서 빠짐).
//  * 회색 줄·충전·내 계좌 이체·이체 규칙에 맞는 줄은 '이체'.
//  * 같은 원문 안의 겹친 줄: 지역화폐의 잔액 차감 줄, 결제수단 표시 없는 같은 금액 줄.
//  * 결제수단 이름을 가족의 결제수단에 연결하고, 카테고리는 같은 가맹점의 예전 기록을 우선한다.

import { fromKst } from '../kst.ts';
import { matchTransferRule } from '../rules.ts';
import type { Category, PaymentMethod, Transaction, TransactionSource, TransferRule } from '../types.ts';
import { isWrapperLabel, merchantSimilarity, normalizeMerchant } from './text.ts';
import type { Candidate, ExtractedItem, Extraction } from './types.ts';

export interface NormalizeContext {
  source: TransactionSource;
  paymentMethods: PaymentMethod[];
  transferRules: TransferRule[];
  categories: Category[];
  /** 같은 가맹점의 예전 카테고리를 찾는 데 쓰는 최근 내역. */
  history: Pick<Transaction, 'merchant' | 'splits' | 'kind' | 'deleted_at'>[];
  /** 원문에 날짜가 없을 때 쓸 날짜(받은 날). */
  fallbackDate: string;
}

const compact = (s: string) => s.toLowerCase().replace(/[\s()[\]·.\-_/]/g, '');

/** '네이버 현대카드' 같은 표시 이름을 가족의 결제수단에 연결한다. 가장 길게 겹치는 것을 고른다. */
export function resolvePaymentMethod(
  label: string | null,
  last4: string | null,
  methods: readonly PaymentMethod[],
): PaymentMethod | null {
  const live = methods.filter((m) => !m.deleted_at);
  if (last4) {
    const byLast4 = live.filter((m) => m.last4 && m.last4 === last4);
    if (byLast4.length === 1) return byLast4[0]!;
  }
  if (!label) return null;
  const target = compact(label);
  // 페이 이름은 그 이름 그대로 등록한 결제수단이 있을 때만 연결한다(안에 든 카드가 진짜 결제수단).
  if (isWrapperLabel(label)) return live.find((m) => [m.name, ...m.aliases].some((k) => compact(k) === target)) ?? null;
  let best: { method: PaymentMethod; score: number } | null = null;
  for (const m of live) {
    for (const key of [m.name, ...m.aliases]) {
      const k = compact(key);
      if (k.length < 2) continue;
      const score = target === k ? 1000 : target.includes(k) ? k.length : 0;
      if (score > 0 && (!best || score > best.score)) best = { method: m, score };
    }
  }
  return best?.method ?? null;
}

const TRANSFER_WORDS = /(내\s*계좌\s*이체|카드\s*대금|카드대금)/;
/** 충전은 이체지만, 하이패스·교통카드 충전은 쓰는 내역이 따로 찍히지 않으므로 지출로 둔다. */
const isTransferCharge = (s: string) => /충전/.test(s) && !/하이패스|교통카드|티머니|캐시비|레일플러스/.test(s);

function decideKind(item: ExtractedItem, rules: readonly TransferRule[], trustGrey: boolean): { kind: Candidate['kind']; note: string | null } {
  // AI 가 검은 금액을 회색으로 잘못 읽는 일이 있어서, 이체다운 단서(이체·충전·'A → B' 계좌·카드사 이름)가 함께 있을 때만 믿는다.
  const transferish = /이체|충전|대금|머니|→|->|카드$/.test(`${item.merchant} ${item.payment_label ?? ''}`.trim()) || /카드$/.test(item.merchant.trim());
  if (trustGrey && item.greyed && transferish && item.kind !== 'transfer')
    return { kind: 'transfer', note: '원문에서 소비가 아닌 줄로 표시되어 이체로 분류' };
  if (item.kind !== 'transfer' && (TRANSFER_WORDS.test(item.merchant) || isTransferCharge(item.merchant)))
    return { kind: 'transfer', note: '충전·계좌 이체로 보여 이체로 분류' };
  const rule = item.kind !== 'transfer' ? matchTransferRule([item.merchant, item.memo], rules) : null;
  if (rule) return { kind: 'transfer', note: `이체 규칙 ‘${rule.label}’` };
  return { kind: item.kind, note: null };
}

function categoryFor(merchant: string, kind: Candidate['kind'], hint: string | null, ctx: NormalizeContext): string | null {
  if (kind === 'transfer') return null;
  const want = kind === 'income' ? 'income' : 'expense';
  const key = normalizeMerchant(merchant);
  if (key) {
    for (const tx of ctx.history) {
      if (tx.deleted_at || tx.kind !== kind || tx.splits.length !== 1) continue;
      if (normalizeMerchant(tx.merchant) === key && tx.splits[0]!.category_id) {
        const cat = ctx.categories.find((c) => c.id === tx.splits[0]!.category_id);
        if (cat && !cat.deleted_at && !cat.archived) return cat.id;
      }
    }
  }
  if (!hint) return null;
  const live = ctx.categories.filter((c) => c.kind === want && !c.deleted_at && !c.archived);
  const h = compact(hint);
  return (live.find((c) => compact(c.name) === h) ?? live.find((c) => compact(c.name).includes(h) || h.includes(compact(c.name))))?.id ?? null;
}

export function normalizeExtraction(extraction: Extraction, ctx: NormalizeContext): Candidate[] {
  const candidates: Candidate[] = [];
  extraction.items.forEach((item, index) => {
    if (item.status === 'declined') return;
    const amount = Math.round(Math.abs(item.amount));
    if (!Number.isFinite(amount) || amount <= 0 || !item.merchant?.trim()) return;

    const notes: string[] = [];
    // 회색 표시('소비 아님')는 토스·은행 앱 목록에서만 의미가 있다. 페이 앱·영수증의 흐린 글씨는 무시한다.
    const trustGrey = ['toss_list', 'bank_app', 'other'].includes(extraction.source_kind);
    const { kind, note } = decideKind(item, ctx.transferRules, trustGrey);
    if (note) notes.push(note);
    if (item.status === 'partial_canceled') notes.push(`부분취소 (원래 ${item.original_amount ?? '?'}원)`);
    if (item.foreign_currency && item.foreign_amount) notes.push(`해외 결제 ${item.foreign_amount} ${item.foreign_currency}`);

    const date = item.date && /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : ctx.fallbackDate;
    const time = item.time && /^\d{1,2}:\d{2}$/.test(item.time) ? item.time.padStart(5, '0') : null;
    const method = resolvePaymentMethod(item.payment_label, item.card_last4, ctx.paymentMethods);
    const merchant = item.merchant.trim().slice(0, 60);

    candidates.push({
      index,
      kind,
      status: item.status === 'canceled' ? 'canceled' : 'confirmed',
      amount,
      original_amount: item.original_amount && item.original_amount !== amount ? Math.round(item.original_amount) : null,
      occurred_at: fromKst(date, time ?? '12:00'),
      has_time: !!time,
      date,
      merchant,
      memo: [item.memo?.trim(), ...(item.foreign_currency && item.foreign_amount ? [`${item.foreign_amount} ${item.foreign_currency}`] : [])]
        .filter(Boolean)
        .join(' · ')
        .slice(0, 200) || null,
      payment_method_id: method?.id ?? null,
      payment_label: item.payment_label?.trim() || null,
      card_last4: item.card_last4,
      approval_no: item.approval_no,
      installment_months: Math.min(60, Math.max(1, item.installment_months ?? 1)),
      category_id: categoryFor(merchant, kind, item.category_hint, ctx),
      line_items: item.line_items ?? [],
      source: ctx.source,
      notes,
      suspect_of_index: null,
    });
  });
  return collapsePairs(candidates, ctx.paymentMethods);
}

const isLabeled = (c: Candidate) => !!(c.payment_label || c.payment_method_id);

export function isLocalCurrency(c: Pick<Candidate, 'payment_method_id' | 'payment_label'>, methods: readonly PaymentMethod[]): boolean {
  const m = c.payment_method_id ? methods.find((x) => x.id === c.payment_method_id) : null;
  if (m?.type === 'local_currency') return true;
  return /여민전|지역화폐|코나|chak|동백전|온통대전|인천e음|경기지역화폐/i.test(c.payment_label ?? '');
}

/**
 * 같은 원문 안에서 같은 결제가 두 줄로 보이는 경우를 정리한다.
 *  1) 지역화폐 결제 + 표시 없는 잔액 차감 줄(캐시백만큼 작음) → 지역화폐 줄만 남긴다.
 *  2) 결제수단 표시 있는 줄 + 표시 없는 같은 금액 줄: 이름이 비슷하면 하나로, 다르면 '확인 필요'.
 */
function collapsePairs(cands: Candidate[], methods: readonly PaymentMethod[]): Candidate[] {
  const dropped = new Set<number>();
  const used = new Set<number>();
  for (const u of cands) {
    if (isLabeled(u) || u.kind !== 'expense' || u.status !== 'confirmed') continue;
    // 1) 지역화폐 잔액 차감 줄
    const local = cands.find(
      (l) =>
        !used.has(l.index) &&
        isLabeled(l) &&
        l.kind === 'expense' &&
        l.status === 'confirmed' &&
        l.date === u.date &&
        isLocalCurrency(l, methods) &&
        u.amount < l.amount &&
        u.amount >= l.amount * 0.5 &&
        (merchantSimilarity(l.merchant, u.merchant) ?? 0) >= 0.85,
    );
    if (local) {
      dropped.add(u.index);
      used.add(local.index);
      local.notes.push(`캐시백을 뺀 잔액 차감 줄(${u.amount}원)은 같은 결제라 뺐습니다`);
      continue;
    }
    // 2) 같은 금액 두 줄
    const twin = cands.find(
      (l) => !used.has(l.index) && isLabeled(l) && l.kind === u.kind && l.status === u.status && l.date === u.date && l.amount === u.amount,
    );
    if (twin) {
      used.add(twin.index);
      if ((merchantSimilarity(twin.merchant, u.merchant) ?? 0) >= 0.6) {
        dropped.add(u.index);
        twin.notes.push('결제수단 표시 없는 같은 금액 줄은 같은 결제라 뺐습니다');
      } else if (Math.abs(twin.index - u.index) === 1) {
        // 이름이 다르면 화면에서 바로 붙어 있을 때만 같은 결제로 의심한다(예: 코레일 / 철도승차권발매).
        u.suspect_of_index = twin.index;
      } else {
        used.delete(twin.index);
      }
    }
  }
  // 취소된 두 줄(예: '코레일 취소' + '철도승차권발매 취소')도 같은 방식으로 하나만 남긴다.
  for (const u of cands) {
    if (dropped.has(u.index) || isLabeled(u) || u.status !== 'canceled') continue;
    const twin = cands.find((l) => !dropped.has(l.index) && isLabeled(l) && l.status === 'canceled' && l.date === u.date && l.amount === u.amount);
    if (twin) dropped.add(u.index);
  }
  return cands.filter((c) => !dropped.has(c.index));
}
