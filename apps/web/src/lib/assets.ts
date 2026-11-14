import type { PaymentMethod, PaymentMethodType } from '@moayo/core';

/** 자산 종류별 기본 아이콘. 자산에 아이콘을 따로 정하면 그것을 쓴다. */
export const ASSET_TYPE_ICON: Record<PaymentMethodType, string> = {
  cash: '💵',
  bank_account: '🏦',
  check_card: '💳',
  credit_card: '💳',
  local_currency: '🪙',
  gift_voucher: '🎟️',
  easy_pay: '📱',
};

export function assetIcon(pm: Pick<PaymentMethod, 'type'> & { icon?: string | null } | null | undefined): string {
  if (!pm) return '';
  return pm.icon || ASSET_TYPE_ICON[pm.type] || '💰';
}
