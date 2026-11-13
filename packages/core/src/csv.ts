import { toKstDate, toKstTime } from './kst.ts';
import type { Category, Member, PaymentMethod, Tag, Transaction } from './types.ts';

const KIND_LABEL = { expense: '지출', income: '수입', transfer: '이체' } as const;
const STATUS_LABEL = { confirmed: '', review: '확인 필요', canceled: '취소' } as const;

function cell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  // 엑셀이 수식으로 해석하지 않게 막는다(CSV 인젝션 방지).
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export interface CsvLookup {
  categories: Map<string, Category>;
  paymentMethods: Map<string, PaymentMethod>;
  members: Map<string, Member>;
  tags: Map<string, Tag>;
}

/** 엑셀에서 바로 열리는 CSV(UTF-8 BOM). 분할된 내역은 카테고리를 "식비 50000; 의류 50000" 처럼 적는다. */
export function transactionsToCsv(txs: readonly Transaction[], lookup: CsvLookup): string {
  const header = [
    '날짜', '시각', '구분', '금액', '카테고리', '가맹점·내용', '결제수단', '현금일', '할부', '쓴 사람', '태그', '메모', '상태',
  ];
  const rows = [...txs]
    .filter((t) => !t.deleted_at)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
    .map((t) => {
      const catName = (id: string | null) => (id ? lookup.categories.get(id)?.name ?? '' : '미분류');
      const category =
        t.splits.length > 1
          ? t.splits.map((s) => `${catName(s.category_id)} ${s.amount}`).join('; ')
          : t.splits.length === 1
            ? catName(t.splits[0]!.category_id)
            : '미분류';
      return [
        toKstDate(t.occurred_at),
        t.has_time ? toKstTime(t.occurred_at) : '',
        KIND_LABEL[t.kind],
        t.amount,
        category,
        t.merchant,
        t.payment_method_id ? lookup.paymentMethods.get(t.payment_method_id)?.name : '',
        t.cash_date,
        t.installment_months > 1 ? `${t.installment_months}개월` : '',
        t.member_id ? lookup.members.get(t.member_id)?.display_name : '',
        t.tag_ids.map((id) => lookup.tags.get(id)?.name).filter(Boolean).join(' '),
        t.memo,
        STATUS_LABEL[t.status],
      ]
        .map(cell)
        .join(',');
    });
  return '﻿' + [header.map(cell).join(','), ...rows].join('\r\n') + '\r\n';
}
