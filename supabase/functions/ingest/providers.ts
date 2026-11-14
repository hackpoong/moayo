// AI 업체 어댑터. 같은 지시문·스키마를 받아 같은 모양(Extraction)을 돌려준다.
// 업체·모델은 환경변수(AI_PROVIDER, AI_MODEL)로 바꾸고, 평가 때는 요청마다 지정한다.

import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0';
import { coerceExtraction, EXTRACTION_SCHEMA, toAnyOfNullable, type Extraction } from '../_shared/core/index.ts';

export type Provider = 'anthropic' | 'gemini' | 'openai';

export type Effort = 'minimal' | 'low' | 'medium' | 'high';

export interface ExtractInput {
  system: string;
  instruction: string;
  image?: { mime: string; b64: string };
  /** 사진 여러 장(카드 앞·뒷면 등). image 와 함께 쓰면 image 가 먼저. */
  images?: { mime: string; b64: string }[];
  /** 결과 JSON 스키마. 없으면 내역 추출 스키마. */
  schema?: Record<string, unknown>;
  /** 생각(추론) 깊이. 옮겨 적기는 낮아도 충분하고, 출력 토큰(=비용)이 크게 준다. */
  effort?: Effort;
}

export interface ExtractOutput {
  extraction: Extraction;
  provider: Provider;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
  /** 대략의 비용(USD). 단가표에 없는 모델이면 null. */
  cost_usd: number | null;
  ms: number;
}

/** 1M 토큰당 USD (입력, 출력). 평가표용 근사치. */
const PRICES: Record<string, [number, number]> = {
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-sonnet-5-5': [2, 10],
  'claude-opus-5-5': [4, 20],
  'gemini-3.5-flash': [1.5, 9],
  'gemini-3.5-flash-lite': [0.3, 2.5],
  'gemini-3.1-flash-lite': [0.25, 1.5],
  'gemini-2.5-flash-lite': [0.1, 0.4],
  'gpt-5.4-nano': [0.2, 1.25],
  'gpt-5.4-mini': [0.75, 4.5],
  'gpt-5-nano': [0.05, 0.4],
};

const SCHEMA = toAnyOfNullable(EXTRACTION_SCHEMA) as Record<string, unknown>;

export class ExtractError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

const imagesOf = (input: ExtractInput) => [...(input.image ? [input.image] : []), ...(input.images ?? [])];

/** 스키마를 정해 주고 JSON 을 그대로 받는다(카드 읽기 등). */
export async function generate(provider: Provider, model: string, input: ExtractInput & { schema: Record<string, unknown> }) {
  const run = provider === 'anthropic' ? anthropic : provider === 'gemini' ? gemini : openai;
  const { json, usage } = await run(model, { ...input, schema: toAnyOfNullable(input.schema) as Record<string, unknown> });
  const price = PRICES[model];
  return { json, usage, cost_usd: price ? (usage.input_tokens * price[0] + usage.output_tokens * price[1]) / 1_000_000 : null };
}

export async function extract(provider: Provider, model: string, input: ExtractInput): Promise<ExtractOutput> {
  const started = Date.now();
  const run = provider === 'anthropic' ? anthropic : provider === 'gemini' ? gemini : openai;
  const { json, usage } = await run(model, input);
  const price = PRICES[model];
  return {
    extraction: coerceExtraction(json),
    provider,
    model,
    usage,
    cost_usd: price ? (usage.input_tokens * price[0] + usage.output_tokens * price[1]) / 1_000_000 : null,
    ms: Date.now() - started,
  };
}

function key(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new ExtractError(`${name} 가 설정되지 않았습니다(Supabase → Edge Functions → Secrets).`);
  return value;
}

function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new ExtractError('AI 응답을 JSON 으로 읽지 못했습니다.', true);
  }
}

// ── Claude ────────────────────────────────────────────────────────────────
let anthropicClient: Anthropic | null = null;

async function anthropic(model: string, input: ExtractInput) {
  anthropicClient ??= new Anthropic({ apiKey: key('ANTHROPIC_API_KEY'), maxRetries: 2 });
  const content: Anthropic.ContentBlockParam[] = [];
  for (const img of imagesOf(input)) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: img.mime as 'image/jpeg', data: img.b64 },
    });
  }
  content.push({ type: 'text', text: input.instruction });

  try {
    const params = {
      model,
      max_tokens: 16000,
      system: input.system,
      messages: [{ role: 'user' as const, content }],
      // 옮겨 적기는 깊이 생각할 일이 아니라서 effort 를 낮춘다.
      output_config: { effort: (input.effort === 'minimal' ? 'low' : (input.effort ?? 'low')) as 'low' | 'medium' | 'high', format: { type: 'json_schema' as const, schema: input.schema ?? SCHEMA } },
    };
    // Sonnet·Opus 는 안전 분류기가 드물게 거절할 때 서버가 다른 모델로 이어서 처리하게 한다(Haiku 는 해당 없음).
    const response = /^claude-(sonnet|opus)-5-5/.test(model)
      ? await anthropicClient.beta.messages.create({
          ...(params as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming),
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        })
      : await anthropicClient.messages.create(params);
    if (response.stop_reason === 'refusal') throw new ExtractError('AI 가 이 원문 처리를 거절했습니다.');
    if (response.stop_reason === 'max_tokens') throw new ExtractError('원문이 너무 길어 끝까지 읽지 못했습니다.');
    const text = (response.content as { type: string; text?: string }[]).map((b) => (b.type === 'text' ? (b.text ?? '') : '')).join('');
    return {
      json: parseJson(text),
      usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
    };
  } catch (e) {
    if (e instanceof ExtractError) throw e;
    if (e instanceof Anthropic.RateLimitError) throw new ExtractError('AI 사용량이 잠시 몰렸습니다. 잠시 뒤 다시 시도해 주세요.', true);
    if (e instanceof Anthropic.AuthenticationError) throw new ExtractError('ANTHROPIC_API_KEY 가 올바르지 않습니다.');
    if (e instanceof Anthropic.BadRequestError) throw new ExtractError(`AI 요청 오류: ${e.message}`);
    if (e instanceof Anthropic.APIError) throw new ExtractError(`AI 서버 오류(${e.status}): ${e.message}`, true);
    throw e;
  }
}

// ── Gemini ────────────────────────────────────────────────────────────────
async function gemini(model: string, input: ExtractInput) {
  const parts: unknown[] = [];
  for (const img of imagesOf(input)) parts.push({ inlineData: { mimeType: img.mime, data: img.b64 } });
  parts.push({ text: input.instruction });
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key('GEMINI_API_KEY') },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input.system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: input.schema ?? SCHEMA,
        temperature: 0,
        // Gemini 3 계열: 생각 깊이(minimal/low/medium/high). 정하지 않으면 모델 기본값.
        ...(input.effort ? { thinkingConfig: { thinkingLevel: input.effort } } : {}),
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ExtractError(`Gemini 오류(${res.status}): ${body?.error?.message ?? res.statusText}`, res.status >= 500 || res.status === 429);
  const text = (body.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
  const u = body.usageMetadata ?? {};
  return {
    json: parseJson(text),
    usage: { input_tokens: u.promptTokenCount ?? 0, output_tokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) },
  };
}

// ── OpenAI ────────────────────────────────────────────────────────────────
async function openai(model: string, input: ExtractInput) {
  const content: unknown[] = [];
  for (const img of imagesOf(input)) content.push({ type: 'input_image', image_url: `data:${img.mime};base64,${img.b64}` });
  content.push({ type: 'input_text', text: input.instruction });
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key('OPENAI_API_KEY')}` },
    body: JSON.stringify({
      model,
      instructions: input.system,
      input: [{ role: 'user', content }],
      reasoning: { effort: input.effort ?? 'low' },
      text: { format: { type: 'json_schema', name: 'extraction', strict: true, schema: input.schema ?? SCHEMA } },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ExtractError(`OpenAI 오류(${res.status}): ${body?.error?.message ?? res.statusText}`, res.status >= 500 || res.status === 429);
  const text = (body.output ?? [])
    .flatMap((o: { content?: { type: string; text?: string }[] }) => o.content ?? [])
    .filter((c: { type: string }) => c.type === 'output_text')
    .map((c: { text?: string }) => c.text ?? '')
    .join('');
  return {
    json: parseJson(text),
    usage: { input_tokens: body.usage?.input_tokens ?? 0, output_tokens: body.usage?.output_tokens ?? 0 },
  };
}
