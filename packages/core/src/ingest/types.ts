// AI·규칙 파서가 원문에서 뽑아낸 결과의 모양. 이미지·문자·푸시 모두 이 모양으로 모인다.

import type { DateString, Payment, TransactionKind, TransactionSource } from '../types.ts';

export type SourceKind =
  | 'toss_list' // 토스 소비·지출 내역 목록 캡처
  | 'local_currency_app' // 여민전 등 지역화폐 앱 이용내역
  | 'receipt' // 종이·전자 영수증
  | 'card_statement' // 카드 명세서
  | 'pay_history' // 네이버페이·카카오페이 결제내역
  | 'bank_app' // 은행 앱 거래내역
  | 'sms' // 결제·입출금 문자
  | 'push' // 앱 알림
  | 'other';

export type ExtractedStatus = 'approved' | 'canceled' | 'partial_canceled' | 'declined';

export interface ExtractedLine {
  name: string;
  amount: number;
  quantity: number | null;
}

/** 원문에 보이는 결제 한 줄. */
export interface ExtractedItem {
  /** 'YYYY-MM-DD'. 원문에 없으면 null. */
  date: DateString | null;
  /** 'HH:mm'. 원문에 없으면 null. */
  time: string | null;
  merchant: string;
  /** 실제로 낸(받은) 최종 금액. 원 단위 양수. */
  amount: number;
  /** 할인·부분취소 전 금액(취소선으로 보이는 값). 없으면 null. */
  original_amount: number | null;
  kind: TransactionKind;
  status: ExtractedStatus;
  /** 원문에 적힌 결제수단 이름 그대로(예: '네이버 현대카드', '내 하나은행 계좌'). 없으면 null. */
  payment_label: string | null;
  card_last4: string | null;
  /** 원문에 보이는 카드번호 그대로(가림표 포함, 예: '4111-22**-****-1234', '411122'). 자산 연결에만 쓴다. */
  card_number_hint?: string | null;
  approval_no: string | null;
  /** 원문 앱이 회색 등으로 '소비 아님'을 표시한 줄(내 계좌 이체, 충전, 카드대금 등). */
  greyed: boolean;
  foreign_currency: string | null;
  foreign_amount: number | null;
  installment_months: number | null;
  memo: string | null;
  line_items: ExtractedLine[];
  /** 가족 카테고리 목록 중 가장 알맞은 이름. 모르면 null. */
  category_hint: string | null;
  /** 가게·품목에 어울리는 이모지(AI). 제목 앞에 붙인다. */
  emoji?: string | null;
  /** 영수증에서 여러 결제수단으로 나눠 낸 몫(카드 + 상품권 + 마일리지 등). */
  tenders?: ExtractedTender[];
}

export type TenderKind = 'card' | 'cash' | 'point' | 'voucher' | 'other';

export interface ExtractedTender {
  kind: TenderKind;
  label: string | null;
  amount: number;
  card_number_hint: string | null;
  /** 포인트·마일리지 회원 이름(가려진 그대로, 예: 황*주). */
  holder: string | null;
}

export interface Extraction {
  source_kind: SourceKind;
  items: ExtractedItem[];
}

/** 정리를 마친, 저장 직전의 후보. */
export interface Candidate {
  index: number;
  kind: TransactionKind;
  status: 'confirmed' | 'canceled';
  amount: number;
  original_amount: number | null;
  occurred_at: string;
  has_time: boolean;
  date: DateString;
  merchant: string | null;
  memo: string | null;
  payment_method_id: string | null;
  payment_label: string | null;
  card_last4: string | null;
  approval_no: string | null;
  installment_months: number;
  /** 여러 결제수단으로 나눠 낸 경우의 자산별 몫(2개 이상일 때만). */
  payments?: Payment[];
  category_id: string | null;
  line_items: ExtractedLine[];
  source: TransactionSource;
  /** 같은 원문 안에서 함께 정리된 이유(사람이 읽을 설명). */
  notes: string[];
  /** 같은 원문 안의 다른 후보와 같은 결제로 의심될 때 그 후보 번호. */
  suspect_of_index: number | null;
}

export type MatchAction = 'created' | 'merged' | 'duplicate' | 'review' | 'skipped';
