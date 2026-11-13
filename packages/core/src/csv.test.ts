import { describe, expect, it } from 'vitest';
import { transactionsToCsv } from './csv.ts';
import { makeTx } from './testkit.ts';

describe('transactionsToCsv', () => {
  const empty = { categories: new Map(), paymentMethods: new Map(), members: new Map(), tags: new Map() };

  it('BOM, 헤더, 따옴표 처리', () => {
    const csv = transactionsToCsv([makeTx({ merchant: '가게, "본점"', amount: 1000 })], empty);
    expect(csv.startsWith('﻿날짜,')).toBe(true);
    expect(csv).toContain('"가게, ""본점"""');
  });

  it('수식으로 해석될 수 있는 값은 막는다', () => {
    const csv = transactionsToCsv([makeTx({ memo: '=HYPERLINK("x")' })], empty);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('삭제된 내역은 빠진다', () => {
    const csv = transactionsToCsv([makeTx({ deleted_at: '2026-11-13T00:00:00Z' })], empty);
    expect(csv.trim().split('\r\n')).toHaveLength(1);
  });
});
