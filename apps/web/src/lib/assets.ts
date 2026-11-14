import { PAYMENT_METHOD_TYPES, type PaymentMethod, type PaymentMethodType } from '@moayo/core';

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

/**
 * 자산판·자산설정에 보이는 그룹 순서. 현금은 맨 앞이 아니라 맨 끝(기타 그룹의 💵현금)으로 둔다.
 * 예전 '현금' 그룹 자산이 남아 있으면 기타 뒤에 보인다.
 */
export const ASSET_GROUP_ORDER: readonly PaymentMethodType[] = [...PAYMENT_METHOD_TYPES.filter((t) => t !== 'cash'), 'cash'];

/** 자산을 새로 만들 때 고를 수 있는 그룹(현금은 기타 그룹의 기본 자산으로 대신한다). */
export const PICKABLE_ASSET_TYPES: readonly PaymentMethodType[] = PAYMENT_METHOD_TYPES.filter((t) => t !== 'cash');
