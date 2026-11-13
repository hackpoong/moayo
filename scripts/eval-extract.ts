// AI 인식 정확도 비교.
//   node --experimental-strip-types scripts/eval-extract.ts --truth <정답 json> --out <결과 폴더> [--models a:b,c:d] [--images 폴더]
// 정답 파일과 이미지는 개인 정보라서 레포 밖에 둔다. 서버 함수의 평가 모드(x-eval-key)로 읽는다(DB 는 건드리지 않음).
// 환경변수: FUNCTION_URL, EVAL_KEY

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  matchCandidates,
  merchantSimilarity,
  normalizeExtraction,
  toKstDate,
  type Extraction,
  type ExtractedItem,
  type PaymentMethod,
  type Transaction,
} from '../packages/core/src/index.ts';

interface TruthRow {
  date: string;
  merchant: string;
  amount: number;
  kind: 'expense' | 'income' | 'transfer';
  kind_any: boolean;
  status: ExtractedItem['status'];
  payment_label: string | null;
  greyed: boolean;
  original_amount: number | null;
  foreign: [string, number] | null;
  time: string | null;
  memo: string | null;
  optional: boolean;
}
interface TruthImage {
  id: string;
  path: string;
  items: TruthRow[];
}

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : fallback;
};
const truthPath = arg('truth')!;
const outDir = arg('out', 'eval-out')!;
const imageDir = arg('images');
const models = (arg('models', 'anthropic:claude-haiku-5-5,anthropic:claude-sonnet-5-5,gemini:gemini-3.5-flash-lite,gemini:gemini-2.5-flash-lite,openai:gpt-5.4-nano,openai:gpt-5.4-mini') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => {
    const [provider, model] = s.split(':');
    return { provider: provider!, model: model! };
  });
const FUNCTION_URL = process.env.FUNCTION_URL!;
const EVAL_KEY = process.env.EVAL_KEY!;
if (!truthPath || !FUNCTION_URL || !EVAL_KEY) throw new Error('--truth, FUNCTION_URL, EVAL_KEY 가 필요합니다.');

const truth = JSON.parse(readFileSync(truthPath, 'utf8')) as TruthImage[];
mkdirSync(outDir, { recursive: true });

const EXPENSE = ['식비', '카페·간식', '생활용품', '주거·관리비', '통신', '교통·차량', '의료·건강', '교육', '육아', '의류·미용', '문화·여가', '경조사·선물', '보험·금융', '기타'];
const INCOME = ['급여', '부수입', '용돈', '금융수입', '기타수입'];

interface Call {
  extraction: Extraction | null;
  usage?: { input_tokens: number; output_tokens: number };
  cost_usd?: number | null;
  ms?: number;
  error?: string;
}

async function callOnce(provider: string, model: string, img: TruthImage): Promise<Call> {
  const file = imageDir ? join(imageDir, basename(img.path)) : img.path;
  const b64 = readFileSync(file).toString('base64');
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-eval-key': EVAL_KEY },
    body: JSON.stringify({ provider, model, image_b64: b64, mime: 'image/jpeg', today: '2026-11-14', expense_categories: EXPENSE, income_categories: INCOME }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) return { extraction: null, error: String(body.error ?? res.status) };
  return body as unknown as Call;
}

async function call(provider: string, model: string, img: TruthImage): Promise<Call> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await callOnce(provider, model, img);
    if (!r.error || !/429|503|overloaded|잠시/.test(r.error)) return r;
    await new Promise((resolve) => setTimeout(resolve, 4000 * (attempt + 1)));
  }
  return callOnce(provider, model, img);
}

const statusClass = (s: string) => (s === 'partial_canceled' ? 'approved' : s);
const compact = (s: string | null) => (s ?? '').replace(/[\s·→>-]/g, '').toLowerCase();

/** 예측 줄을 정답 줄과 짝짓는다(날짜·금액·상태가 같은 것 중 이름이 가장 비슷한 것). */
function pair(pred: ExtractedItem[], rows: TruthRow[]) {
  const used = new Set<number>();
  const pairs: { t: TruthRow; p: ExtractedItem | null }[] = [];
  for (const t of rows) {
    let best = -1;
    let bestSim = -1;
    pred.forEach((p, i) => {
      if (used.has(i) || p.date !== t.date || p.amount !== t.amount || statusClass(p.status) !== statusClass(t.status)) return;
      const sim = merchantSimilarity(p.merchant, t.merchant) ?? 0;
      if (sim > bestSim) {
        best = i;
        bestSim = sim;
      }
    });
    if (best >= 0) used.add(best);
    pairs.push({ t, p: best >= 0 ? pred[best]! : null });
  }
  const extras = pred.filter((_, i) => !used.has(i));
  return { pairs, extras };
}

// 기본 결제수단(지금 가족 설정)으로 실제 파이프라인을 돌려 최종 가계부를 만든다.
const pm = (id: string, name: string, type: PaymentMethod['type']): PaymentMethod => ({
  id, household_id: 'h', created_at: '', updated_at: '', deleted_at: null, name, type, issuer: null, last4: null,
  owner_member_id: null, aliases: [], billing: null, color: null, sort: 0, archived: false,
});
const methods = [pm('cash', '현금', 'cash'), pm('ymj', '여민전', 'local_currency'), pm('onnuri', '온누리상품권', 'gift_voucher')];

function ledger(extractions: Extraction[]): Transaction[] {
  let db: Transaction[] = [];
  let n = 0;
  for (const ex of extractions) {
    const cands = normalizeExtraction(ex, { source: 'screenshot', paymentMethods: methods, transferRules: [], categories: [], history: [], fallbackDate: '2026-11-14' });
    for (const d of matchCandidates(cands, db, { householdId: 'h', memberId: null, paymentMethods: methods, now: '', newId: () => `t${++n}` })) {
      if (d.action === 'created' || d.action === 'review') db.push(d.tx);
      if (d.action === 'merged') db = db.map((t) => (t.id === d.tx.id ? d.tx : t));
    }
  }
  return db;
}
const ledgerKey = (t: Transaction) => `${toKstDate(t.occurred_at)}|${t.amount}|${t.kind}|${t.status === 'canceled' ? 'c' : 'a'}`;
function ledgerDiff(expected: Transaction[], actual: Transaction[]) {
  const bag = new Map<string, number>();
  for (const t of expected) bag.set(ledgerKey(t), (bag.get(ledgerKey(t)) ?? 0) + 1);
  let hit = 0;
  const extra: string[] = [];
  for (const t of actual) {
    const k = ledgerKey(t);
    if ((bag.get(k) ?? 0) > 0) {
      bag.set(k, bag.get(k)! - 1);
      hit++;
    } else extra.push(`${k} ${t.merchant}`);
  }
  const missing = [...bag.entries()].flatMap(([k, n]) => Array(n).fill(k));
  return { hit, expected: expected.length, extra, missing };
}

const truthExtraction = (img: TruthImage): Extraction => ({
  source_kind: 'toss_list',
  items: img.items.map((r) => ({
    date: r.date, time: r.time, merchant: r.merchant, amount: r.amount, original_amount: r.original_amount, kind: r.kind,
    status: r.status, payment_label: r.payment_label, card_last4: null, approval_no: null, greyed: r.greyed,
    foreign_currency: r.foreign?.[0] ?? null, foreign_amount: r.foreign?.[1] ?? null, installment_months: null, memo: r.memo,
    line_items: [], category_hint: null,
  })),
});
const expectedLedger = ledger(truth.map(truthExtraction));

const report: Record<string, unknown>[] = [];
for (const { provider, model } of models) {
  const label = `${provider}:${model}`;
  const cacheFile = join(outDir, `${label.replace(/[:/]/g, '_')}.json`);
  let calls: Call[];
  if (existsSync(cacheFile)) calls = JSON.parse(readFileSync(cacheFile, 'utf8'));
  else {
    calls = [];
    for (let i = 0; i < truth.length; i += 4) {
      calls.push(...(await Promise.all(truth.slice(i, i + 4).map((img) => call(provider, model, img)))));
      process.stdout.write(`\r${label} ${calls.length}/${truth.length}`);
    }
    process.stdout.write('\n');
    writeFileSync(cacheFile, JSON.stringify(calls, null, 1));
  }

  const errors = calls.filter((c) => c.error);
  if (errors.length === calls.length) {
    report.push({ model: label, error: errors[0]!.error });
    continue;
  }
  let required = 0, found = 0, extras = 0, merchantOk = 0, kindOk = 0, labelOk = 0, greyOk = 0, origOk = 0, origTotal = 0, timeOk = 0, timeTotal = 0, matched = 0;
  const misses: string[] = [];
  const extraRows: string[] = [];
  truth.forEach((img, i) => {
    const pred = calls[i]?.extraction?.items ?? [];
    const { pairs, extras: ex } = pair(pred, img.items);
    for (const { t, p } of pairs) {
      if (!t.optional) required++;
      if (!p) {
        if (!t.optional) misses.push(`${img.id} ${t.date} ${t.merchant} ${t.amount}`);
        continue;
      }
      if (!t.optional) found++;
      matched++;
      if ((merchantSimilarity(p.merchant, t.merchant) ?? 0) >= 0.8) merchantOk++;
      if (p.kind === t.kind || (t.kind_any && p.kind === 'expense')) kindOk++;
      if (compact(p.payment_label) === compact(t.payment_label)) labelOk++;
      if (p.greyed === t.greyed) greyOk++;
      if (t.original_amount !== null) {
        origTotal++;
        if (p.original_amount === t.original_amount) origOk++;
      }
      if (t.time) {
        timeTotal++;
        if (p.time === t.time) timeOk++;
      }
    }
    // 정답에 없는 줄(광고·승인거절 오독·환각). 잘린 줄로 표시한 정답 외에는 모두 군더더기.
    extras += ex.length;
    for (const e of ex) extraRows.push(`${img.id} ${e.date} ${e.merchant} ${e.amount} ${e.status}`);
  });
  const final = ledger(calls.map((c) => c.extraction ?? { source_kind: 'other', items: [] }));
  const diff = ledgerDiff(expectedLedger, final);
  const cost = calls.reduce((s, c) => s + (c.cost_usd ?? 0), 0);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
  report.push({
    model: label,
    errors: errors.length,
    rows_found_pct: pct(found, required),
    extra_rows: extras,
    merchant_pct: pct(merchantOk, matched),
    kind_pct: pct(kindOk, matched),
    payment_label_pct: pct(labelOk, matched),
    greyed_pct: pct(greyOk, matched),
    original_amount_pct: pct(origOk, origTotal),
    time_pct: pct(timeOk, timeTotal),
    final_ledger_pct: pct(diff.hit, diff.expected),
    final_extra: diff.extra.length,
    cost_usd_22_images: Math.round(cost * 10000) / 10000,
    cost_krw_per_image: Math.round(((cost / truth.length) * 1450) * 100) / 100,
    avg_seconds: Math.round(calls.reduce((s, c) => s + (c.ms ?? 0), 0) / calls.length / 100) / 10,
    misses,
    extra_rows_list: extraRows,
    ledger_missing: diff.missing,
    ledger_extra: diff.extra,
  });
}
writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 1));
const HIDDEN = new Set(['misses', 'extra_rows_list', 'ledger_missing', 'ledger_extra']);
console.table(report.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !HIDDEN.has(k)))));
