import type { PaymentMethodType } from '@moayo/core';

/** 이름으로 결제수단 종류를 짐작한다. */
export function guessPaymentType(label: string): PaymentMethodType {
  if (/여민전|코나|지역화폐/.test(label)) return 'local_currency';
  if (/온누리|상품권/.test(label)) return 'gift_voucher';
  if (/체크/.test(label)) return 'check_card';
  if (/카드/.test(label)) return 'credit_card';
  if (/페이|머니/.test(label)) return 'easy_pay';
  if (/현금|ATM/i.test(label)) return 'cash';
  if (/계좌|통장|은행|뱅크/.test(label)) return 'bank_account';
  return 'credit_card';
}
