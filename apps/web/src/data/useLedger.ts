import { toAllEntries, type DateBasis, type LedgerEntry } from '@moayo/core';
import { useMemo } from 'react';
import { useData } from './dataContext.ts';

/** 가족 전체 내역을 날짜 기준에 맞춰 펼친 조각. 통계·달력이 같이 쓴다. */
export function useLedger(basis: DateBasis): LedgerEntry[] {
  const { transactions } = useData();
  return useMemo(() => toAllEntries(transactions, basis), [transactions, basis]);
}
