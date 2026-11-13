// DB 행과 같은 모양(snake_case)을 그대로 쓴다. 서버·로컬 저장소·화면이 한 가지 타입을 공유한다.

export type Uuid = string;
/** ISO 8601 시각 (UTC). */
export type IsoDateTime = string;
/** 'YYYY-MM-DD' (한국 시간 기준 날짜). */
export type DateString = string;

/** 동기화되는 모든 행이 갖는 공통 필드. */
export interface SyncedRow {
  id: Uuid;
  household_id: Uuid;
  created_at: IsoDateTime;
  /** 서버가 매긴다. 로컬에서 아직 올리지 못한 행은 로컬 시각이 들어 있다. */
  updated_at: IsoDateTime;
  deleted_at: IsoDateTime | null;
}

export interface Household {
  id: Uuid;
  name: string;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
  deleted_at: IsoDateTime | null;
}

export type MemberRole = 'owner' | 'member';

export interface Member extends SyncedRow {
  user_id: Uuid;
  display_name: string;
  role: MemberRole;
  color: string | null;
}

export const PAYMENT_METHOD_TYPES = [
  'cash',
  'credit_card',
  'check_card',
  'bank_account',
  'local_currency',
  'gift_voucher',
  'easy_pay',
] as const;
export type PaymentMethodType = (typeof PAYMENT_METHOD_TYPES)[number];

export const PAYMENT_METHOD_TYPE_LABEL: Record<PaymentMethodType, string> = {
  cash: '현금',
  credit_card: '신용카드',
  check_card: '체크카드',
  bank_account: '계좌',
  local_currency: '지역화폐',
  gift_voucher: '상품권',
  easy_pay: '간편결제 머니',
};

/**
 * 신용카드 청구 규칙.
 * 예) 결제일 14일, 이용기간 전월 1일~말일  → closing_day 31, payment_day 14, payment_month_offset 1
 * 예) 결제일 25일, 이용기간 전월 12일~당월 11일 → closing_day 11, payment_day 25, payment_month_offset 0
 */
export interface BillingRule {
  /** 이용기간 마감일. 1~31, 그 달에 없는 날이면 말일로 본다. */
  closing_day: number;
  /** 결제일. 1~31, 그 달에 없는 날이면 말일로 본다. */
  payment_day: number;
  /** 마감일이 속한 달로부터 몇 달 뒤에 결제되는지. */
  payment_month_offset: number;
}

export interface PaymentMethod extends SyncedRow {
  name: string;
  type: PaymentMethodType;
  issuer: string | null;
  last4: string | null;
  owner_member_id: Uuid | null;
  aliases: string[];
  billing: BillingRule | null;
  color: string | null;
  sort: number;
  archived: boolean;
}

export type CategoryKind = 'expense' | 'income';

export interface Category extends SyncedRow {
  name: string;
  kind: CategoryKind;
  icon: string | null;
  color: string | null;
  parent_id: Uuid | null;
  sort: number;
  archived: boolean;
}

export interface Tag extends SyncedRow {
  name: string;
}

export type TransferMatchType = 'name' | 'account' | 'keyword';

export interface TransferRule extends SyncedRow {
  label: string;
  match_type: TransferMatchType;
  pattern: string;
  enabled: boolean;
}

export type TransactionKind = 'expense' | 'income' | 'transfer';
export type TransactionStatus = 'confirmed' | 'review' | 'canceled';
export type TransactionSource = 'manual' | 'image' | 'screenshot' | 'statement' | 'sms' | 'push' | 'share';

export interface Split {
  /** null 이면 미분류. */
  category_id: Uuid | null;
  amount: number;
}

export interface ReceiptItem {
  name: string;
  amount: number;
  quantity?: number;
}

export interface Transaction extends SyncedRow {
  kind: TransactionKind;
  status: TransactionStatus;
  /** 원 단위 정수. */
  amount: number;
  occurred_at: IsoDateTime;
  has_time: boolean;
  cash_date: DateString;
  cash_date_override: boolean;
  merchant: string | null;
  memo: string | null;
  payment_method_id: Uuid | null;
  member_id: Uuid | null;
  installment_months: number;
  splits: Split[];
  tag_ids: Uuid[];
  approval_no: string | null;
  card_last4: string | null;
  items: ReceiptItem[] | null;
  source: TransactionSource;
  field_sources: Record<string, string>;
  linked_tx_id: Uuid | null;
  created_by: Uuid | null;
  /** 원문에 적힌 결제수단 이름(아직 결제수단과 연결되지 않았을 때 보여 주고, 나중에 연결한다). */
  payment_label: string | null;
  /** status 가 'review' 일 때 이유와 같은 결제로 의심되는 내역. */
  review: TransactionReview | null;
}

export interface TransactionReview {
  reason: string;
  duplicate_of: Uuid | null;
}

/** 달력·통계를 어느 날짜로 볼지. */
export type DateBasis = 'occurred' | 'cash';
