import { toKstDate } from './kst.ts';
import type { DateString, Transaction, TransactionKind, Uuid } from './types.ts';

export interface TransactionFilter {
  text?: string;
  kinds?: TransactionKind[];
  categoryIds?: (Uuid | null)[];
  paymentMethodIds?: (Uuid | null)[];
  memberIds?: (Uuid | null)[];
  tagIds?: Uuid[];
  minAmount?: number;
  maxAmount?: number;
  from?: DateString;
  to?: DateString;
  onlyReview?: boolean;
}

export interface SearchLookup {
  categoryName: (id: Uuid) => string | undefined;
  tagName: (id: Uuid) => string | undefined;
  paymentMethodName: (id: Uuid) => string | undefined;
}

const fold = (s: string) => s.toLowerCase().replace(/\s+/g, '');

/** 가맹점·메모·카테고리·태그·결제수단 이름과 금액으로 찾는다. 낱말을 띄우면 모두 맞아야 한다. */
export function matchesFilter(tx: Transaction, filter: TransactionFilter, lookup: SearchLookup): boolean {
  if (tx.deleted_at) return false;
  if (filter.onlyReview && tx.status !== 'review') return false;
  if (filter.kinds?.length && !filter.kinds.includes(tx.kind)) return false;
  if (filter.minAmount !== undefined && tx.amount < filter.minAmount) return false;
  if (filter.maxAmount !== undefined && tx.amount > filter.maxAmount) return false;
  if (filter.paymentMethodIds?.length && !filter.paymentMethodIds.includes(tx.payment_method_id)) return false;
  if (filter.memberIds?.length && !filter.memberIds.includes(tx.member_id)) return false;
  if (filter.tagIds?.length && !filter.tagIds.some((t) => tx.tag_ids.includes(t))) return false;
  if (filter.categoryIds?.length) {
    const cats = tx.splits.length ? tx.splits.map((s) => s.category_id) : [null];
    if (!cats.some((c) => filter.categoryIds!.includes(c))) return false;
  }
  if (filter.from || filter.to) {
    const d = toKstDate(tx.occurred_at);
    if (filter.from && d < filter.from) return false;
    if (filter.to && d > filter.to) return false;
  }

  const words = (filter.text ?? '').split(/\s+/).map(fold).filter(Boolean);
  if (words.length === 0) return true;

  const fields = [
    tx.merchant,
    tx.memo,
    ...tx.splits.map((s) => (s.category_id ? lookup.categoryName(s.category_id) : '미분류')),
    ...tx.tag_ids.map((t) => lookup.tagName(t)),
    tx.payment_method_id ? lookup.paymentMethodName(tx.payment_method_id) : undefined,
    ...(tx.items ?? []).map((i) => i.name),
  ]
    .filter((f): f is string => !!f)
    .map(fold);
  const amountText = String(tx.amount);

  return words.every((w) => {
    const digits = w.replace(/[,원]/g, '');
    if (/^\d+$/.test(digits) && amountText.includes(digits)) return true;
    return fields.some((f) => f.includes(w));
  });
}
