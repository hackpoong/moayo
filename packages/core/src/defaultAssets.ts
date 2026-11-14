// 사람마다 기본으로 두는 기타 자산: 현금 · 포인트·마일리지 · 상품권.
// 영수증에 이 결제수단으로 낸 몫이 보이면 여기에 연결한다(issuer 표지로 찾아서 이름을 바꿔도 된다).

import type { PaymentMethod, Uuid } from './types.ts';

export const DEFAULT_ASSET_MARK = { cash: 'moayo:cash', point: 'moayo:point', voucher: 'moayo:voucher' } as const;
export type DefaultAssetKind = keyof typeof DEFAULT_ASSET_MARK;

export const DEFAULT_ASSETS: readonly { kind: DefaultAssetKind; name: string; icon: string; suffix: string }[] = [
  { kind: 'cash', name: '현금', icon: '💵', suffix: '0000000000c1' },
  { kind: 'point', name: '포인트·마일리지', icon: '🎁', suffix: '0000000000c2' },
  { kind: 'voucher', name: '상품권', icon: '🎫', suffix: '0000000000c3' },
];

/** 두 사람의 폰이 동시에 만들어도 하나만 남도록 사람 id 로 정한 자산 id. */
export function defaultAssetId(memberId: Uuid, kind: DefaultAssetKind): Uuid {
  return `${memberId.slice(0, 24)}${DEFAULT_ASSETS.find((a) => a.kind === kind)!.suffix}`;
}

export function isDefaultAsset(pm: Pick<PaymentMethod, 'issuer'>): boolean {
  return Object.values(DEFAULT_ASSET_MARK).includes(pm.issuer as never);
}
