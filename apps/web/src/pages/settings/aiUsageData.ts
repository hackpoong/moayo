import { shiftMonth, todayKst, toKstDate } from '@moayo/core';
import { useEffect, useState } from 'react';
import { useCurrentHousehold } from '../../lib/householdContext.ts';
import { db, describeError } from '../../lib/supabase.ts';

/** 원화 환산에 쓰는 대략의 환율. 실제 청구는 달러로 된다. */
export const KRW_PER_USD = 1450;

export interface UsageRow {
  created_at: string;
  parser: string | null;
  model: string | null;
  status: 'pending' | 'done' | 'failed';
  usage: { input_tokens?: number; output_tokens?: number; cost_usd?: number | null } | null;
}

export interface MonthUsage {
  month: string;
  ai: number;
  rule: number;
  failed: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

export interface ModelUsage {
  model: string;
  calls: number;
  costUsd: number;
}

/** 모델별 건수·비용(최근 것 위주). */
export function usageByModel(rows: readonly UsageRow[], month: string): ModelUsage[] {
  const map = new Map<string, ModelUsage>();
  for (const r of rows) {
    if (!r.model || !r.parser?.startsWith('llm:') || toKstDate(r.created_at).slice(0, 7) !== month) continue;
    const m = map.get(r.model) ?? { model: r.model, calls: 0, costUsd: 0 };
    m.calls += 1;
    m.costUsd += r.usage?.cost_usd ?? 0;
    map.set(r.model, m);
  }
  return [...map.values()].sort((a, b) => b.costUsd - a.costUsd);
}

export function summarizeUsage(rows: readonly UsageRow[]): { months: MonthUsage[]; latestModel: string | null } {
  const byMonth = new Map<string, MonthUsage>();
  let latestModel: string | null = null;
  for (const r of rows) {
    const month = toKstDate(r.created_at).slice(0, 7);
    const m = byMonth.get(month) ?? { month, ai: 0, rule: 0, failed: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 };
    if (r.status === 'failed') m.failed += 1;
    else if (r.parser?.startsWith('llm:')) m.ai += 1;
    else if (r.parser) m.rule += 1;
    m.costUsd += r.usage?.cost_usd ?? 0;
    m.inputTokens += r.usage?.input_tokens ?? 0;
    m.outputTokens += r.usage?.output_tokens ?? 0;
    byMonth.set(month, m);
    if (!latestModel && r.model) latestModel = r.model;
  }
  return { months: [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month)), latestModel };
}

/** 최근 6개월 사용 기록(서버의 원문 보관함). 가족 구성원만 읽을 수 있다. */
export function useAiUsage(): { rows: UsageRow[] | null; error: string | null } {
  const household = useCurrentHousehold();
  const [rows, setRows] = useState<UsageRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const since = new Date(`${shiftMonth(todayKst().slice(0, 7), -5)}-01T00:00:00+09:00`).toISOString();
    void db()
      .from('raw_inputs')
      .select('created_at, parser, model, status, usage')
      .eq('household_id', household.householdId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(10000)
      .then(({ data, error: e }) => {
        if (!active) return;
        if (e) setError(describeError(e));
        else setRows((data ?? []) as UsageRow[]);
      });
    return () => {
      active = false;
    };
  }, [household.householdId]);
  return { rows, error };
}
