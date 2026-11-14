// 자동 입력 입구. 웹의 사진·붙여넣기와 (나중에) 안드로이드 알림 수집이 모두 여기로 들어온다.
//  원문 저장 → 읽기(문자 규칙 → 안 되면 AI) → 정리 → 기존 내역과 맞추기 → 저장 → 결과 돌려주기
// 평가 모드(x-eval-key)는 DB 를 건드리지 않고 AI 로 읽은 결과만 돌려준다.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';
import {
  buildSystemPrompt,
  extractionIssues,
  maskSensitive,
  matchCandidates,
  normalizeExtraction,
  parseSms,
  todayKst,
  USER_INSTRUCTION_IMAGE,
  USER_INSTRUCTION_TEXT,
  type Category,
  type Member,
  type MerchantRule,
  type Decision,
  type Extraction,
  type PaymentMethod,
  type Transaction,
  type TransactionSource,
  type TransferRule,
} from '../_shared/core/index.ts';
import { extract, ExtractError, type Effort, type ExtractOutput, type Provider } from './providers.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DEFAULT_PROVIDER = (Deno.env.get('AI_PROVIDER') ?? 'anthropic') as Provider;
const DEFAULT_MODEL = Deno.env.get('AI_MODEL') ?? 'claude-haiku-5-5';
const DEFAULT_EFFORT = (Deno.env.get('AI_EFFORT') || undefined) as Effort | undefined;
// '정확하게'를 고르면 쓰는 모델(없으면 기본 모델).
const ACCURATE_PROVIDER = (Deno.env.get('AI_PROVIDER_ACCURATE') || Deno.env.get('AI_PROVIDER') || 'anthropic') as Provider;
const ACCURATE_MODEL = Deno.env.get('AI_MODEL_ACCURATE') || null;
const ACCURATE_EFFORT = (Deno.env.get('AI_EFFORT_ACCURATE') || undefined) as Effort | undefined;
// 싼 모델을 먼저 쓰고, 결과가 미심쩍을 때만 위의 모델로 다시 읽는다(비워 두면 처음부터 위 모델).
const FAST_PROVIDER = (Deno.env.get('AI_PROVIDER_FAST') || Deno.env.get('AI_PROVIDER') || 'anthropic') as Provider;
const FAST_MODEL = Deno.env.get('AI_MODEL_FAST') || null;
const FAST_EFFORT = (Deno.env.get('AI_EFFORT_FAST') || undefined) as Effort | undefined;
const DAILY_AI_LIMIT = Number(Deno.env.get('DAILY_AI_LIMIT') ?? '300');
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://moayou.netlify.app,http://localhost:5173,http://localhost:4173')
  .split(',')
  .map((s) => s.trim());

const SOURCES = ['image', 'screenshot', 'statement', 'sms', 'push', 'share', 'text'] as const;
type InputSource = (typeof SOURCES)[number];

interface IngestBody {
  household_id: string;
  source: InputSource;
  text?: string;
  image_path?: string;
  received_at?: string;
  app_package?: string;
  /** 앱이 계산한 이미지 지문(256비트, 16진수). 거의 같은 사진을 다시 올리면 AI 를 다시 부르지 않는다. */
  image_phash?: string;
  /** 'accurate' 면 더 정확한(비싼) 모델로. 모델 이름은 서버가 정한다. */
  quality?: 'fast' | 'accurate';
}

/** 16진수 지문 두 개의 다른 비트 수. */
function hamming(a: string, b: string): number {
  if (a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i += 8) {
    let x = parseInt(a.slice(i, i + 8), 16) ^ parseInt(b.slice(i, i + 8), 16);
    while (x) {
      d += x & 1;
      x >>>= 1;
    }
  }
  return d;
}
const PHASH_MAX_DISTANCE = 6;

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allowed = ALLOWED_ORIGINS.includes(origin) || /^https:\/\/[a-z0-9-]+--moayou\.netlify\.app$/.test(origin);
  return {
    'access-control-allow-origin': allowed ? origin : ALLOWED_ORIGINS[0]!,
    'access-control-allow-headers': 'authorization, content-type, x-client-info, apikey, x-eval-key',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'origin',
  };
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...cors(req) } });
}

async function sha256(data: Uint8Array<ArrayBuffer> | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

function mimeOf(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  return ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
}

function txSource(source: InputSource): TransactionSource {
  return source === 'text' ? 'sms' : source;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'POST 만 받습니다.' });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // ── 평가 모드 ────────────────────────────────────────────────────────────
  const evalKey = req.headers.get('x-eval-key');
  if (evalKey) {
    if (evalKey !== Deno.env.get('EVAL_KEY')) return json(req, 401, { error: 'eval key mismatch' });
    return handleEval(req);
  }

  // ── 로그인 확인 ──────────────────────────────────────────────────────────
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json(req, 401, { error: '로그인이 필요합니다.' });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json(req, 401, { error: '로그인이 만료되었습니다. 다시 로그인해 주세요.' });
  const userId = userData.user.id;

  let body: IngestBody;
  try {
    body = await req.json();
  } catch {
    return json(req, 400, { error: '요청 형식이 잘못되었습니다.' });
  }
  if (!body.household_id || !SOURCES.includes(body.source)) return json(req, 400, { error: 'household_id 와 source 가 필요합니다.' });
  if (!body.text?.trim() && !body.image_path) return json(req, 400, { error: '문구나 이미지가 필요합니다.' });
  if (body.text && body.text.length > 20000) return json(req, 400, { error: '문구가 너무 깁니다.' });

  const { data: member } = await admin
    .from('members')
    .select('id')
    .eq('household_id', body.household_id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!member) return json(req, 403, { error: '이 가족의 구성원이 아닙니다.' });

  try {
    const result = await ingest(admin, body, userId, member.id as string);
    return json(req, 200, result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('ingest failed', message);
    return json(req, e instanceof ExtractError && e.retryable ? 503 : 500, { error: message });
  }
});

async function ingest(admin: SupabaseClient, body: IngestBody, userId: string, memberId: string) {
  const householdId = body.household_id;

  // ── 원문 읽어 오기 ────────────────────────────────────────────────────────
  let image: { mime: string; b64: string } | undefined;
  let hash: string;
  if (body.image_path) {
    if (!body.image_path.startsWith(`${householdId}/`)) throw new Error('다른 가족의 파일입니다.');
    const { data: file, error } = await admin.storage.from('inputs').download(body.image_path);
    if (error || !file) throw new Error('올린 이미지를 찾지 못했습니다.');
    const bytes = new Uint8Array(await file.arrayBuffer()) as Uint8Array<ArrayBuffer>;
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error('이미지가 너무 큽니다(5MB 이하).');
    hash = await sha256(bytes);
    image = { mime: mimeOf(body.image_path), b64: toBase64(bytes) };
  } else {
    hash = await sha256(`${body.source}\n${body.text!.trim()}`);
  }

  // 같은 원문을 다시 보내면 처음 결과를 그대로 돌려준다(재전송·더블탭 대비).
  const { data: previous } = await admin
    .from('raw_inputs')
    .select('id, status, result, model')
    .eq('household_id', householdId)
    .eq('content_hash', hash)
    .maybeSingle();
  // '정확하게'로 다시 읽기를 고르면, 예전에 다른 모델로 읽은 결과는 다시 쓰지 않는다.
  const wantsReread = body.quality === 'accurate' && !!ACCURATE_MODEL && previous?.model !== ACCURATE_MODEL;
  if (previous?.status === 'done' && !wantsReread) return { ...(previous.result as object), raw_input_id: previous.id, repeated: true };

  const rawId = previous?.id ?? crypto.randomUUID();
  if (!previous) {
    const { error } = await admin.from('raw_inputs').insert({
      id: rawId,
      household_id: householdId,
      member_id: memberId,
      source: body.source,
      raw_text: body.text?.trim() ?? null,
      image_path: body.image_path ?? null,
      app_package: body.app_package ?? null,
      received_at: body.received_at ?? new Date().toISOString(),
      content_hash: hash,
      image_phash: body.image_phash && /^[0-9a-f]{64}$/.test(body.image_phash) ? body.image_phash : null,
      created_by: userId,
    });
    if (error) throw new Error(`원문 저장 실패: ${error.message}`);
  }

  try {
    // ── 가족 설정 ──────────────────────────────────────────────────────────
    const [pms, cats, rules, history, people, renames] = await Promise.all([
      admin.from('payment_methods').select('*').eq('household_id', householdId).is('deleted_at', null),
      admin.from('categories').select('*').eq('household_id', householdId).is('deleted_at', null),
      admin.from('transfer_rules').select('*').eq('household_id', householdId).is('deleted_at', null),
      admin
        .from('transactions')
        .select('merchant, splits, kind, deleted_at')
        .eq('household_id', householdId)
        .is('deleted_at', null)
        .order('occurred_at', { ascending: false })
        .limit(1500),
      admin.from('members').select('id, household_id, display_name, emoji, aliases, deleted_at').eq('household_id', householdId).is('deleted_at', null),
      admin.from('merchant_rules').select('match_key, set_merchant, set_category_id, set_payment_method_id, deleted_at').eq('household_id', householdId).is('deleted_at', null),
    ]);
    const paymentMethods = (pms.data ?? []) as PaymentMethod[];
    const categories = (cats.data ?? []) as Category[];
    const transferRules = (rules.data ?? []) as TransferRule[];
    const today = todayKst(body.received_at ? new Date(body.received_at) : new Date());

    // ── 읽기: 문자는 규칙 먼저, 안 되면 AI ─────────────────────────────────
    let extraction: Extraction | null = null;
    let parser = 'rule:sms';
    let ai: ExtractOutput | null = null;
    if (!image && body.text) extraction = parseSms(body.text, today);

    // 거의 같은 사진(같은 화면을 다시 캡처해 시계만 다른 경우 등)은 예전에 읽은 결과를 다시 쓴다.
    if (!extraction && !wantsReread && image && body.image_phash && /^[0-9a-f]{64}$/.test(body.image_phash)) {
      const { data: recent } = await admin
        .from('raw_inputs')
        .select('id, image_phash, extraction')
        .eq('household_id', householdId)
        .eq('status', 'done')
        .not('image_phash', 'is', null)
        .neq('id', rawId)
        .order('created_at', { ascending: false })
        .limit(500);
      const twin = (recent ?? []).find((r) => r.extraction && hamming(r.image_phash as string, body.image_phash!) <= PHASH_MAX_DISTANCE);
      if (twin) {
        extraction = twin.extraction as Extraction;
        parser = `reuse:${twin.id}`;
      }
    }

    if (!extraction) {
      const { count } = await admin
        .from('raw_inputs')
        .select('id', { count: 'exact', head: true })
        .eq('household_id', householdId)
        .like('parser', 'llm:%')
        .gte('created_at', new Date(Date.now() - 86_400_000).toISOString());
      if ((count ?? 0) >= DAILY_AI_LIMIT) throw new Error(`오늘 AI 인식 한도(${DAILY_AI_LIMIT}건)를 넘었습니다. 내일 다시 시도해 주세요.`);

      const system = buildSystemPrompt({
        today,
        expenseCategories: categories.filter((c) => c.kind === 'expense' && !c.archived).map((c) => c.name),
        incomeCategories: categories.filter((c) => c.kind === 'income' && !c.archived).map((c) => c.name),
      });
      const input = { system, instruction: image ? USER_INSTRUCTION_IMAGE : USER_INSTRUCTION_TEXT + maskSensitive(body.text!), image };
      ai =
        body.quality === 'accurate' && ACCURATE_MODEL
          ? await extract(ACCURATE_PROVIDER, ACCURATE_MODEL, { ...input, effort: ACCURATE_EFFORT })
          : await readWithCascade(input, today, !!image);
      extraction = ai.extraction;
      parser = `llm:${ai.provider}`;
    }

    // ── 정리 → 맞추기 ──────────────────────────────────────────────────────
    const source = txSource(body.source);
    const candidates = normalizeExtraction(extraction, {
      source,
      paymentMethods,
      transferRules,
      categories,
      history: (history.data ?? []) as Transaction[],
      fallbackDate: today,
      members: (people.data ?? []) as Member[],
      merchantRules: (renames.data ?? []) as MerchantRule[],
    });

    let existing: Transaction[] = [];
    if (candidates.length) {
      const dates = candidates.map((c) => c.date).sort();
      const from = new Date(Date.parse(`${dates[0]}T00:00:00+09:00`) - 4 * 86_400_000).toISOString();
      const to = new Date(Date.parse(`${dates.at(-1)}T23:59:59+09:00`) + 4 * 86_400_000).toISOString();
      const { data, error } = await admin
        .from('transactions')
        .select('*')
        .eq('household_id', householdId)
        .is('deleted_at', null)
        .gte('occurred_at', from)
        .lte('occurred_at', to)
        .limit(5000);
      if (error) throw new Error(`기존 내역을 읽지 못했습니다: ${error.message}`);
      existing = (data ?? []) as Transaction[];
    }

    const now = new Date().toISOString();
    const decisions = matchCandidates(candidates, existing, {
      householdId,
      memberId,
      paymentMethods,
      now,
      newId: () => crypto.randomUUID(),
    });

    // ── 저장 ──────────────────────────────────────────────────────────────
    const toWrite = decisions
      .filter((d) => d.action === 'created' || d.action === 'review' || d.action === 'merged')
      .map((d) => {
        const row: Record<string, unknown> = { ...d.tx };
        delete row.updated_at;
        if (d.action !== 'merged') row.created_by = userId;
        else delete row.created_by;
        // 기록에 '누가 불러왔는지' 남기도록.
        row.updated_by = userId;
        return row;
      });
    if (toWrite.length) {
      const { error } = await admin.from('transactions').upsert(toWrite, { onConflict: 'id' });
      if (error) throw new Error(`내역 저장 실패: ${error.message}`);
    }
    const links = decisions
      .filter((d) => d.action !== 'skipped')
      .map((d) => ({
        household_id: householdId,
        transaction_id: d.tx.id,
        raw_input_id: rawId,
        candidate_index: d.candidate.index,
        action: d.action,
        filled_fields: d.filled_fields,
      }));
    if (links.length) await admin.from('transaction_sources').insert(links);

    const result = summarize(decisions, extraction, parser);
    await admin
      .from('raw_inputs')
      .update({
        status: 'done',
        parser,
        model: ai?.model ?? null,
        extraction,
        result,
        error: null,
        usage: ai ? { ...ai.usage, cost_usd: ai.cost_usd, ms: ai.ms } : null,
      })
      .eq('id', rawId);
    return { ...result, raw_input_id: rawId };
  } catch (e) {
    await admin
      .from('raw_inputs')
      .update({ status: 'failed', error: e instanceof Error ? e.message : String(e) })
      .eq('id', rawId);
    throw e;
  }
}

function summarize(decisions: Decision[], extraction: Extraction, parser: string) {
  const count = (a: Decision['action']) => decisions.filter((d) => d.action === a).length;
  return {
    parser,
    source_kind: extraction.source_kind,
    read: extraction.items.length,
    created: count('created'),
    merged: count('merged'),
    duplicate: count('duplicate'),
    review: count('review'),
    items: decisions.map((d) => ({
      action: d.action,
      transaction_id: d.tx.id,
      merchant: d.tx.merchant,
      amount: d.tx.amount,
      kind: d.tx.kind,
      status: d.tx.status,
      occurred_at: d.tx.occurred_at,
      reason: d.reason,
    })),
  };
}

// ── 싼 모델 먼저, 미심쩍으면 정확한 모델로 ─────────────────────────────────
async function readWithCascade(input: { system: string; instruction: string; image?: { mime: string; b64: string } }, today: string, isImage: boolean): Promise<ExtractOutput> {
  if (!FAST_MODEL) return extract(DEFAULT_PROVIDER, DEFAULT_MODEL, { ...input, effort: DEFAULT_EFFORT });
  let first: ExtractOutput | null = null;
  try {
    first = await extract(FAST_PROVIDER, FAST_MODEL, { ...input, effort: FAST_EFFORT });
    if (extractionIssues(first.extraction, today, { isImage }).length === 0) return first;
  } catch (e) {
    console.warn('fast model failed, escalating', e instanceof Error ? e.message : e);
  }
  const second = await extract(DEFAULT_PROVIDER, DEFAULT_MODEL, { ...input, effort: DEFAULT_EFFORT });
  if (!first) return second;
  return {
    ...second,
    model: `${first.model}→${second.model}`,
    usage: {
      input_tokens: first.usage.input_tokens + second.usage.input_tokens,
      output_tokens: first.usage.output_tokens + second.usage.output_tokens,
    },
    cost_usd: first.cost_usd !== null && second.cost_usd !== null ? first.cost_usd + second.cost_usd : null,
    ms: first.ms + second.ms,
  };
}

// ── 평가: 같은 이미지를 여러 업체·모델로 읽어 비교한다(DB 는 건드리지 않음) ──────
async function handleEval(req: Request): Promise<Response> {
  const body = (await req.json()) as {
    provider: Provider;
    model: string;
    image_b64?: string;
    mime?: string;
    text?: string;
    today: string;
    expense_categories?: string[];
    income_categories?: string[];
    effort?: Effort;
  };
  try {
    const system = buildSystemPrompt({
      today: body.today,
      expenseCategories: body.expense_categories ?? [],
      incomeCategories: body.income_categories ?? [],
    });
    const out = await extract(body.provider, body.model, {
      system,
      instruction: body.image_b64 ? USER_INSTRUCTION_IMAGE : USER_INSTRUCTION_TEXT + maskSensitive(body.text ?? ''),
      image: body.image_b64 ? { mime: body.mime ?? 'image/jpeg', b64: body.image_b64 } : undefined,
      effort: body.effort,
    });
    return json(req, 200, out);
  } catch (e) {
    return json(req, 502, { error: e instanceof Error ? e.message : String(e) });
  }
}
