import { applyRename, hasChanges, normalizeMerchant, renameChanges, renameTargets, type MerchantRule, type RenameChanges, type Transaction } from '@moayo/core';
import { ArrowRight, Check } from 'lucide-react';
import { useCallback, useState, type ReactNode } from 'react';
import { Sheet } from '../components/Sheet.tsx';
import { useToast } from '../components/toastContext.ts';
import { Button } from '../components/ui.tsx';
import { useData } from '../data/dataContext.ts';
import { baseRow, useMutations } from '../data/mutations.ts';
import { assetIcon } from '../lib/assets.ts';
import { haptic } from '../lib/flash.ts';
import { useCurrentHousehold } from '../lib/householdContext.ts';
import { BulkRenameContext } from './bulkContext.ts';

interface Ask {
  before: Transaction;
  changes: RenameChanges;
  sameDay: Transaction[];
  all: Transaction[];
}

/** 고친 내역과 원래 이름이 같은 내역들을 같이 바꿀지 묻는다. '앞으로도'를 고르면 규칙으로 남긴다. */
export function BulkRenameProvider({ children }: { children: ReactNode }) {
  const data = useData();
  const [ask, setAsk] = useState<Ask | null>(null);

  const prompt = useCallback(
    (before: Transaction, after: Transaction) => {
      const changes = renameChanges(before, after);
      if (!hasChanges(changes)) return;
      const t = renameTargets(before, data.transactions);
      if (t.all.length === 0) return;
      // 고치기 화면이 내려간 뒤에 띄운다.
      window.setTimeout(() => setAsk({ before, changes, ...t }), 260);
    },
    [data.transactions],
  );

  return (
    <BulkRenameContext.Provider value={prompt}>
      {children}
      {ask ? <BulkRenameSheet ask={ask} onClose={() => setAsk(null)} /> : null}
    </BulkRenameContext.Provider>
  );
}

function BulkRenameSheet({ ask, onClose }: { ask: Ask; onClose: () => void }) {
  const data = useData();
  const household = useCurrentHousehold();
  const { save, remove } = useMutations();
  const toast = useToast();
  const [keep, setKeep] = useState(false);
  const { before, changes } = ask;

  const saveRule = (): MerchantRule | null => {
    if (!keep) return null;
    const key = normalizeMerchant(before.merchant);
    const existing = data.merchantRules.find((r) => r.match_key === key);
    const rule: MerchantRule = {
      ...(existing ?? { ...baseRow(household.householdId), match_key: key, created_by: null, set_merchant: null, set_category_id: null, set_payment_method_id: null }),
      ...('merchant' in changes ? { set_merchant: changes.merchant ?? null } : {}),
      ...('categoryId' in changes ? { set_category_id: changes.categoryId ?? null } : {}),
      ...('paymentMethodId' in changes ? { set_payment_method_id: changes.paymentMethodId ?? null } : {}),
    };
    void save('merchant_rules', rule);
    return existing ? null : rule;
  };

  const apply = (targets: Transaction[], close: () => void) => {
    haptic(12);
    const updated = targets.map((t) => applyRename(t, changes, data.byId.paymentMethod));
    for (const t of updated) void save('transactions', t);
    const rule = saveRule();
    close();
    toast({
      message: targets.length ? `${targets.length}건 더 바꿨어요${keep ? ' · 앞으로도 바꿔요' : ''}` : '앞으로 들어오는 내역을 바꿔요',
      action: {
        label: '되돌리기',
        onClick: () => {
          for (const t of targets) void save('transactions', t);
          if (rule) void remove('merchant_rules', rule);
        },
      },
    });
  };

  const cat = changes.categoryId ? data.byId.category.get(changes.categoryId) : null;
  const pm = changes.paymentMethodId ? data.byId.paymentMethod.get(changes.paymentMethodId) : null;
  const sameCount = ask.sameDay.length;
  const allCount = ask.all.length;

  return (
    <Sheet title="같은 이름 내역도 바꿀까요?" onClose={onClose}>
      {(close) => (
        <div className="space-y-4 pb-2 pt-1">
          <div className="rounded-xl bg-surface-2 p-3 text-[15px]">
            <p className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold">‘{before.merchant}’</span>
              <ArrowRight className="size-4 text-muted" aria-hidden />
              {'merchant' in changes ? <Chip>{changes.merchant || '제목 없음'}</Chip> : null}
              {'categoryId' in changes ? (
                <Chip>
                  {cat?.icon} {cat?.name ?? '미분류'}
                </Chip>
              ) : null}
              {'paymentMethodId' in changes ? (
                <Chip>
                  {assetIcon(pm)} {pm?.name ?? '자산 없음'}
                </Chip>
              ) : null}
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-3 py-1">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="peer sr-only" />
            <span className="flex size-6 items-center justify-center rounded-md border-2 border-line text-brand-fg peer-checked:border-brand peer-checked:bg-brand" aria-hidden>
              {keep ? <Check className="size-4" /> : null}
            </span>
            <span className="text-[15px] font-semibold">앞으로도 계속 바꾸기</span>
          </label>
          <div className="space-y-2">
            {sameCount > 0 && sameCount < allCount ? (
              <Button block onClick={() => apply(ask.sameDay, close)}>
                오늘 내역 바꾸기 ({sameCount}건)
              </Button>
            ) : null}
            <Button block variant={sameCount > 0 && sameCount < allCount ? 'secondary' : 'primary'} onClick={() => apply(ask.all, close)}>
              모든 내역 바꾸기 ({allCount}건)
            </Button>
            <Button
              block
              variant="ghost"
              onClick={() => {
                if (keep) apply([], close);
                else close();
              }}
            >
              바꾸지 않음
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-surface px-2.5 py-0.5 font-semibold">{children}</span>;
}
