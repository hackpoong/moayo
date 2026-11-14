import { dueMonths, recurringTransaction, recurringTxId, todayKst } from '@moayo/core';
import { useEffect, useRef } from 'react';
import { useDataContext } from './dataContext.ts';
import { useMutations } from './mutations.ts';

/**
 * 앱을 열 때(그리고 하루가 바뀌거나 규칙이 바뀌면) 정기 지출 중 오늘까지 빠진 달을 기록한다.
 * 내역 id 가 규칙 + 연월로 정해져 있어, 두 사람의 폰이 동시에 만들어도 한 건만 남는다.
 * 지운 내역은 다시 만들지 않는다.
 */
export function useRecurringGenerator(): void {
  const { db, data } = useDataContext();
  const { save } = useMutations();
  const done = useRef('');

  useEffect(() => {
    if (!data || data.recurringRules.length === 0) return;
    const today = todayKst();
    const key = `${today}|${data.recurringRules.map((r) => `${r.id}:${r.last_generated_month}:${r.paused}`).join(',')}`;
    if (done.current === key) return;
    done.current = key;
    void (async () => {
      for (const rule of data.recurringRules) {
        const months = dueMonths(rule, today);
        if (!months.length) continue;
        for (const month of months) {
          const id = recurringTxId(rule.id, month);
          if (await db.transactions.get(id)) continue;
          const pm = rule.template.payment_method_id ? data.byId.paymentMethod.get(rule.template.payment_method_id) : undefined;
          await save('transactions', recurringTransaction(rule, month, pm, new Date().toISOString()));
        }
        await save('recurring_rules', { ...rule, last_generated_month: months.at(-1)! });
      }
    })();
  }, [data, db, save]);
}
