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
  /** 아직 가입하지 않은(계정 없는) 구성원은 null. */
  user_id: Uuid | null;
  display_name: string;
  role: MemberRole;
  color: string | null;
  /** 이름 앞 표시(💛, 💙 …). */
  emoji: string | null;
  /** 이 이름으로 보내거나 받은 돈은 이체(지출·수입 아님)로 본다. 실명 등. */
  aliases: string[];
}

/** 자산 그룹. 보여 주는 순서대로. */
export const PAYMENT_METHOD_TYPES = [
  'cash',
  'bank_account',
  'credit_card',
  'check_card',
  'prepaid_card',
  'local_currency',
  'easy_pay',
  'gift_voucher',
  'savings',
  'investment',
  'overdraft',
  'loan',
  'insurance',
  'other',
] as const;
export type PaymentMethodType = (typeof PAYMENT_METHOD_TYPES)[number];

export const PAYMENT_METHOD_TYPE_LABEL: Record<PaymentMethodType, string> = {
  cash: '현금',
  bank_account: '은행',
  credit_card: '신용카드',
  check_card: '체크카드',
  prepaid_card: '선불카드',
  local_currency: '지역화폐',
  easy_pay: '간편결제',
  gift_voucher: '상품권',
  savings: '저축',
  investment: '투자',
  overdraft: '마이너스통장',
  loan: '대출',
  insurance: '보험',
  other: '기타',
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
  /** 이름 앞 아이콘(이모지). 없으면 그룹 기본 아이콘. */
  icon?: string | null;
  /** 카드 대금이 빠져나가는 계좌(자산 id). */
  linked_account_id?: Uuid | null;
  memo?: string | null;
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

/** '앞으로도 계속 바꾸기': 원래 이름이 match_key 인 내역이 들어오면 제목·분류·자산을 바꿔 넣는다. */
export interface MerchantRule extends SyncedRow {
  /** normalizeMerchant 한 원래 이름. */
  match_key: string;
  set_merchant: string | null;
  set_category_id: Uuid | null;
  set_payment_method_id: Uuid | null;
  created_by: Uuid | null;
}

export type ActivityAction = 'import' | 'create' | 'update' | 'delete' | 'restore' | 'merge';

/** 서버가 남기는 기록(읽기만). */
export interface ActivityEntry extends SyncedRow {
  member_id: Uuid | null;
  action: ActivityAction;
  tx_id: Uuid | null;
  tx_label: string | null;
  kind: string | null;
  amount: number | null;
  summary: string | null;
}

/** 정기 지출: 매달 day_of_month 에 template 대로 내역을 만든다. */
export interface RecurringRule extends SyncedRow {
  template: RecurringTemplate;
  day_of_month: number;
  start_month: string;
  times: number | null;
  last_generated_month: string | null;
  paused: boolean;
  created_by: Uuid | null;
}

export interface RecurringTemplate {
  kind: 'expense' | 'income' | 'transfer';
  amount: number;
  merchant: string | null;
  memo: string | null;
  splits: Split[];
  payment_method_id: Uuid | null;
  member_id: Uuid | null;
  tag_ids: Uuid[];
  /** 'HH:MM' 이면 그 시각, null 이면 시각 없음. */
  time: string | null;
}

export type TransactionKind = 'expense' | 'income' | 'transfer';
/** merged: 다른 내역으로 합쳐짐(목록·합계에서 빠지고 linked_tx_id 가 합친 내역). */
export type TransactionStatus = 'confirmed' | 'review' | 'canceled' | 'merged';
export type TransactionSource = 'manual' | 'image' | 'screenshot' | 'statement' | 'sms' | 'push' | 'share';

export interface Split {
  /** null 이면 미분류. */
  category_id: Uuid | null;
  amount: number;
}

/** 여러 자산으로 나눠 낸 결제의 한 몫. */
export interface Payment {
  payment_method_id: Uuid | null;
  /** 이 몫을 낸 사람(보통 자산 주인). */
  member_id: Uuid | null;
  amount: number;
  /** 이 몫이 실제로 나가는 날(카드면 결제일). */
  cash_date: DateString;
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
  /** 할인·포인트·부분취소 전 금액(원문에 취소선으로 보이던 값). 다른 앱의 같은 결제를 맞출 때 쓴다. */
  original_amount: number | null;
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
  /** 여러 자산으로 나눠 냈을 때 자산별 금액. 비어 있으면 payment_method_id·member_id 한 곳에서 전액. */
  payments?: Payment[];
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
