import type { PaymentMethod, PaymentMethodType } from '@moayo/core';

/** 자산 종류별 기본 아이콘. 자산에 아이콘을 따로 정하면 그것을 쓴다. */
export const ASSET_TYPE_ICON: Record<PaymentMethodType, string> = {
  cash: '💵',
  bank_account: '🏦',
  credit_card: '💳',
  check_card: '💳',
  prepaid_card: '🎫',
  local_currency: '🪙',
  easy_pay: '📱',
  gift_voucher: '🎟️',
  savings: '🐷',
  investment: '📈',
  overdraft: '➖',
  loan: '🏛️',
  insurance: '🛡️',
  other: '💰',
};

/** 카드 대금·충전이 빠져나가는 계좌를 고를 수 있는 그룹. */
export const LINKABLE_TYPES: PaymentMethodType[] = ['credit_card', 'check_card', 'prepaid_card', 'local_currency', 'easy_pay'];

export function assetIcon(pm: Pick<PaymentMethod, 'type'> & { icon?: string | null } | null | undefined): string {
  if (!pm) return '';
  return pm.icon || ASSET_TYPE_ICON[pm.type] || '💰';
}
