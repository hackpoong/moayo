// 테스트용 행 만들기 도우미.
import type { Transaction, TransferRule } from './types.ts';

let seq = 0;

export function makeTx(over: Partial<Transaction> = {}): Transaction {
  seq += 1;
  return {
    id: `tx-${seq}`,
    household_id: 'h',
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    deleted_at: null,
    kind: 'expense',
    status: 'confirmed',
    amount: 10000,
    occurred_at: '2026-11-13T03:00:00Z',
    has_time: true,
    cash_date: '2026-11-13',
    cash_date_override: false,
    merchant: null,
    memo: null,
    payment_method_id: null,
    member_id: null,
    installment_months: 1,
    splits: [],
    tag_ids: [],
    approval_no: null,
    card_last4: null,
    items: null,
    source: 'manual',
    field_sources: {},
    linked_tx_id: null,
    created_by: null,
    payment_label: null,
    review: null,
    ...over,
  };
}

export function makeRule(over: Partial<TransferRule> = {}): TransferRule {
  seq += 1;
  return {
    id: `rule-${seq}`,
    household_id: 'h',
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    deleted_at: null,
    label: '규칙',
    match_type: 'name',
    pattern: '',
    enabled: true,
    ...over,
  };
}
