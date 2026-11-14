import type { Transaction } from '@moayo/core';
import { createContext, useContext } from 'react';

/** 내역을 고친 뒤 부른다. 같은 이름의 다른 내역이 있으면 '같이 바꿀까요?'를 묻는다. */
export const BulkRenameContext = createContext<((before: Transaction, after: Transaction) => void) | null>(null);

export function useBulkRename(): (before: Transaction, after: Transaction) => void {
  return useContext(BulkRenameContext) ?? (() => undefined);
}
