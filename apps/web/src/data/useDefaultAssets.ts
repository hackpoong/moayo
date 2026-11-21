import { DEFAULT_ASSET_MARK, DEFAULT_ASSETS, defaultAssetId, type PaymentMethod } from '@moayo/core';
import { useEffect, useRef } from 'react';
import { useDataContext } from './dataContext.ts';
import { baseRow, useMutations } from './mutations.ts';

/**
 * 사람마다 기타 그룹의 현금 · 포인트·마일리지 · 상품권 자산이 있게 한다.
 * id 가 사람마다 정해져 있어 두 폰이 동시에 만들어도 하나만 남고, 지운 것은 다시 만들지 않는다.
 * 서버에서 처음 받아 온 뒤에만 돈다(받기 전에 만들면 이미 있는 것과 겹친다).
 */
export function useDefaultAssets(): void {
  const { db, data, status, householdId } = useDataContext();
  const { save } = useMutations();
  const done = useRef('');

  useEffect(() => {
    if (!data || !status.initialized) return;
    const people = data.members.filter((m) => !m.deleted_at);
    const key = people.map((m) => m.id).join(',');
    if (!key || done.current === key) return;
    done.current = key;
    void (async () => {
      let sort = data.paymentMethods.length;
      for (const m of people) {
        for (const a of DEFAULT_ASSETS) {
          const id = defaultAssetId(m.id, a.kind);
          if (await db.payment_methods.get(id)) continue;
          const row: PaymentMethod = {
            ...baseRow(householdId),
            id,
            name: a.name,
            icon: null,
            type: 'other',
            issuer: DEFAULT_ASSET_MARK[a.kind],
            last4: null,
            owner_member_id: m.id,
            aliases: [],
            billing: null,
            color: null,
            sort: sort++,
            archived: false,
          };
          await save('payment_methods', row);
        }
      }
    })();
  }, [data, db, save, status.initialized, householdId]);
}
