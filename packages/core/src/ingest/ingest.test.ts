import { describe, expect, it } from 'vitest';
import { toKstDate, toKstTime } from '../kst.ts';
import { makeRule, makeTx } from '../testkit.ts';
import type { Category, PaymentMethod, Transaction } from '../types.ts';
import { matchCandidates, type Decision } from './match.ts';
import { normalizeExtraction, resolvePaymentMethod, type NormalizeContext } from './normalize.ts';
import { parseSms } from './sms.ts';
import { maskSensitive, merchantSimilarity } from './text.ts';
import type { ExtractedItem, Extraction } from './types.ts';

// ── 테스트용 가족 설정 ──────────────────────────────────────────────────────
const pm = (id: string, name: string, type: PaymentMethod['type'], extra: Partial<PaymentMethod> = {}): PaymentMethod => ({
  id,
  household_id: 'h',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
  name,
  type,
  issuer: null,
  last4: null,
  owner_member_id: null,
  aliases: [],
  billing: null,
  color: null,
  sort: 0,
  archived: false,
  ...extra,
});
const methods = [
  pm('pm-local', '여민전', 'local_currency'),
  pm('pm-card', '현대카드', 'credit_card', { aliases: ['네이버 현대카드'], billing: { closing_day: 31, payment_day: 14, payment_month_offset: 1 } }),
  pm('pm-check', '하나 체크카드', 'check_card', { aliases: ['달달하나 체크카드'] }),
];
const cat = (id: string, name: string, kind: Category['kind'] = 'expense'): Category => ({
  id,
  household_id: 'h',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
  name,
  kind,
  icon: null,
  color: null,
  parent_id: null,
  sort: 0,
  archived: false,
});
const categories = [cat('c-food', '식비'), cat('c-etc', '기타'), cat('c-inc', '기타수입', 'income')];

const ctx = (over: Partial<NormalizeContext> = {}): NormalizeContext => ({
  source: 'screenshot',
  paymentMethods: methods,
  transferRules: [],
  categories,
  history: [],
  fallbackDate: '2026-11-14',
  ...over,
});

let seq = 0;
const matchCtx = { householdId: 'h', memberId: 'me', paymentMethods: methods, now: '2026-11-14T00:00:00Z', newId: () => `new-${++seq}` };

const item = (over: Partial<ExtractedItem>): ExtractedItem => ({
  date: '2026-11-07',
  time: null,
  merchant: '가게',
  amount: 1000,
  original_amount: null,
  kind: 'expense',
  status: 'approved',
  payment_label: null,
  card_last4: null,
  approval_no: null,
  greyed: false,
  foreign_currency: null,
  foreign_amount: null,
  installment_months: null,
  memo: null,
  line_items: [],
  category_hint: null,
  ...over,
});
const extraction = (items: Partial<ExtractedItem>[], kind: Extraction['source_kind'] = 'toss_list'): Extraction => ({
  source_kind: kind,
  items: items.map(item),
});

/** 기기 DB 처럼 결정을 반영한다. */
function apply(db: Transaction[], decisions: Decision[]): Transaction[] {
  const next = [...db];
  for (const d of decisions) {
    if (d.action === 'created' || d.action === 'review') next.push(d.tx);
    if (d.action === 'merged') next.splice(next.findIndex((t) => t.id === d.tx.id), 1, d.tx);
  }
  return next;
}
function ingest(db: Transaction[], ex: Extraction, c: Partial<NormalizeContext> = {}) {
  const decisions = matchCandidates(normalizeExtraction(ex, ctx(c)), db, matchCtx);
  return { db: apply(db, decisions), decisions };
}

// ── 텍스트 도우미 ──────────────────────────────────────────────────────────
describe('text', () => {
  it('가맹점 유사도: 법인 표기·띄어쓰기 무시, 포함 관계는 높게', () => {
    expect(merchantSimilarity('비엔엠홀딩스(주)', '비엔엠홀딩스 주식회사')).toBe(1);
    expect(merchantSimilarity('이마트', '이마트 세종점')).toBeGreaterThanOrEqual(0.85);
    expect(merchantSimilarity('코레일', '철도승차권발매')).toBeLessThan(0.3);
    expect(merchantSimilarity(null, '가게')).toBeNull();
  });

  it('긴 숫자는 끝 4자리만 남긴다', () => {
    expect(maskSensitive('대출이자(12345678901234-00009)')).toBe(`대출이자(${'*'.repeat(15)}0009)`);
    expect(maskSensitive('12,500원 11/13 12:30')).toBe('12,500원 11/13 12:30');
  });

  it('결제수단 이름 연결: 별칭·이름 포함·끝 4자리', () => {
    expect(resolvePaymentMethod('네이버 현대카드', null, methods)?.id).toBe('pm-card');
    expect(resolvePaymentMethod('세종 여민전 하나멤버스 1Q체크카드(후불교통)', null, methods)?.id).toBe('pm-local');
    expect(resolvePaymentMethod('내 하나은행 계좌', null, methods)).toBeNull();
    expect(resolvePaymentMethod(null, '1234', [...methods, pm('pm-x', '삼성', 'credit_card', { last4: '1234' })])?.id).toBe('pm-x');
  });
});

// ── 정리 ──────────────────────────────────────────────────────────────────
describe('normalizeExtraction', () => {
  it('승인거절은 버리고, 취소는 취소 상태로, 회색·충전·내 계좌 이체는 이체로', () => {
    const cands = normalizeExtraction(
      extraction([
        { merchant: '온라인몰', amount: 479000, status: 'declined', payment_label: '하나 체크카드' },
        { merchant: '파이가게', amount: 46900, status: 'canceled', payment_label: '달달하나 체크카드' },
        { merchant: '내 계좌 이체', amount: 300000, greyed: true, payment_label: '하나 → iM뱅크' },
        { merchant: '온누리자동충전', amount: 46500, payment_label: '내 하나은행 계좌' },
        { merchant: '현대카드', amount: 259727, greyed: true, payment_label: '내 하나은행 계좌' },
      ]),
      ctx(),
    );
    expect(cands.map((c) => [c.merchant, c.kind, c.status])).toEqual([
      ['파이가게', 'expense', 'canceled'],
      ['내 계좌 이체', 'transfer', 'confirmed'],
      ['온누리자동충전', 'transfer', 'confirmed'],
      ['현대카드', 'transfer', 'confirmed'],
    ]);
  });

  it('이체 규칙에 맞는 이름은 이체', () => {
    const cands = normalizeExtraction(extraction([{ merchant: '홍길동', amount: 100000, payment_label: '내 하나 계좌' }]), ctx({ transferRules: [makeRule({ pattern: '홍길동' })] }));
    expect(cands[0]!.kind).toBe('transfer');
  });

  it('지역화폐 결제 + 캐시백을 뺀 잔액 차감 줄 → 지역화폐 줄만 남긴다', () => {
    const cands = normalizeExtraction(
      extraction([
        { merchant: '장터도담점', amount: 540, payment_label: '세종 여민전 하나멤버스 1Q체크카드' },
        { merchant: '장터도담점', amount: 11290 },
        { merchant: '장터도담점', amount: 11550, payment_label: '세종 여민전 하나멤버스 1Q체크카드' },
      ]),
      ctx(),
    );
    expect(cands.map((c) => c.amount)).toEqual([540, 11550]);
  });

  it('결제수단 표시 없는 같은 금액 줄: 이름이 같으면 하나로, 다르면 확인 필요 표시', () => {
    const same = normalizeExtraction(
      extraction([
        { merchant: '버거클럽', amount: 5500 },
        { merchant: '버거클럽', amount: 5500, payment_label: '내 하나은행 계좌' },
      ]),
      ctx(),
    );
    expect(same).toHaveLength(1);
    expect(same[0]!.payment_label).toBe('내 하나은행 계좌');

    const differ = normalizeExtraction(
      extraction([
        { merchant: '코레일', amount: 36900 },
        { merchant: '철도승차권발매', amount: 36900, payment_label: '네이버 현대카드' },
      ]),
      ctx(),
    );
    expect(differ).toHaveLength(2);
    expect(differ[0]!.suspect_of_index).toBe(1);
  });

  it('카테고리: 같은 가맹점의 예전 카테고리 > AI 추천', () => {
    const history = [makeTx({ merchant: '다이소 도담점', splits: [{ category_id: 'c-etc', amount: 1 }] })];
    const cands = normalizeExtraction(extraction([{ merchant: '다이소 도담점', category_hint: '식비' }, { merchant: '국밥집', category_hint: '식비' }]), ctx({ history }));
    expect(cands.map((c) => c.category_id)).toEqual(['c-etc', 'c-food']);
  });
});

// ── 기존 내역과 맞추기 ─────────────────────────────────────────────────────
describe('matchCandidates', () => {
  it('겹치게 찍은 캡처 두 장: 겹친 줄은 합치고, 같은 결제가 여러 번이면 개수만큼만', () => {
    const first = extraction([
      { date: '2026-11-06', merchant: 'ATM', amount: 300000, payment_label: '토스제공 · 현금찾기' },
      { date: '2026-11-06', merchant: 'ATM', amount: 300000, payment_label: '토스제공 · 현금찾기' },
      { date: '2026-11-06', merchant: '약국', amount: 33510, payment_label: '달달하나 체크카드' },
    ]);
    const second = extraction([
      { date: '2026-11-06', merchant: '약국', amount: 33510, payment_label: '달달하나 체크카드' },
      { date: '2026-11-06', merchant: 'ATM', amount: 300000, payment_label: '토스제공 · 현금찾기' },
      { date: '2026-11-06', merchant: 'ATM', amount: 300000, payment_label: '토스제공 · 현금찾기' },
      { date: '2026-11-06', merchant: 'ATM', amount: 300000, payment_label: '토스제공 · 현금찾기' },
    ]);
    let db: Transaction[] = [];
    db = ingest(db, first).db;
    const r = ingest(db, second);
    expect(r.decisions.map((d) => d.action)).toEqual(['duplicate', 'duplicate', 'duplicate', 'created']);
    expect(r.db.filter((t) => t.merchant === 'ATM')).toHaveLength(3);
  });

  it('손으로 넣은 내역과 같은 결제면 합치고 빈 칸만 채운다(사용자 값은 그대로)', () => {
    const manual = makeTx({ id: 'm1', merchant: '이마트', amount: 28700, occurred_at: '2026-11-03T03:00:00Z', has_time: false, payment_method_id: null, memo: '장보기' });
    const r = ingest([manual], extraction([{ date: '2026-11-03', merchant: '이마트 세종점', amount: 28700, payment_label: '네이버 현대카드', category_hint: '식비' }]));
    expect(r.decisions[0]!.action).toBe('merged');
    const tx = r.db[0]!;
    expect(tx.merchant).toBe('이마트');
    expect(tx.memo).toBe('장보기');
    expect(tx.payment_method_id).toBe('pm-card');
    expect(tx.cash_date).toBe('2026-12-14');
    expect(tx.splits).toEqual([{ category_id: 'c-food', amount: 28700 }]);
  });

  it('같은 날 다른 시각의 같은 금액은 따로 산 것으로 본다', () => {
    const first = makeTx({ id: 'a', merchant: '카페', amount: 4500, occurred_at: '2026-11-07T00:00:00Z', has_time: true, payment_method_id: 'pm-check' });
    const r = ingest([first], extraction([{ merchant: '카페', amount: 4500, time: '15:00', payment_label: '달달하나 체크카드' }]));
    expect(r.decisions[0]!.action).toBe('created');
  });

  it('지역화폐 앱 캡처가 시각을 채워 준다', () => {
    let db: Transaction[] = [];
    db = ingest(db, extraction([{ date: '2026-11-11', merchant: '비엔엠홀딩스(주)', amount: 21960, payment_label: '세종 여민전 하나멤버스 1Q체크카드' }])).db;
    const r = ingest(db, extraction([{ date: '2026-11-11', time: '19:23', merchant: '비엔엠홀딩스(주)', amount: 21960, payment_label: '여민전' }], 'local_currency_app'));
    expect(r.decisions[0]!.action).toBe('merged');
    expect(toKstTime(r.db[0]!.occurred_at)).toBe('19:23');
    expect(r.db[0]!.has_time).toBe(true);
  });

  it('지역화폐 잔액 차감 줄이 다른 캡처로 들어와도: 먼저 들어오면 금액을 고치고, 나중이면 버린다', () => {
    // 잔액 차감 줄이 먼저
    let db = ingest([], extraction([{ date: '2026-11-11', merchant: '비엔엠홀딩스(주)', amount: 21371 }])).db;
    let r = ingest(db, extraction([{ date: '2026-11-11', merchant: '비엔엠홀딩스(주)', amount: 21960, payment_label: '세종 여민전 하나멤버스 1Q체크카드' }]));
    expect(r.decisions[0]!.action).toBe('merged');
    expect(r.db).toHaveLength(1);
    expect(r.db[0]!.amount).toBe(21960);
    expect(r.db[0]!.payment_method_id).toBe('pm-local');

    // 지역화폐 줄이 먼저
    db = ingest([], extraction([{ date: '2026-11-11', merchant: '비엔엠홀딩스(주)', amount: 21960, payment_label: '세종 여민전 하나멤버스 1Q체크카드' }])).db;
    r = ingest(db, extraction([{ date: '2026-11-11', merchant: '비엔엠홀딩스(주)', amount: 21371 }]));
    expect(r.decisions[0]!.action).toBe('duplicate');
    expect(r.db).toHaveLength(1);
  });

  it('나중 캡처에서 취소로 바뀐 결제는 취소 상태로 바꾼다', () => {
    const db = ingest([], extraction([{ date: '2026-11-10', merchant: '파이가게', amount: 46900, payment_label: '달달하나 체크카드' }])).db;
    const r = ingest(db, extraction([{ date: '2026-11-10', merchant: '파이가게', amount: 46900, status: 'canceled', payment_label: '달달하나 체크카드' }]));
    expect(r.decisions[0]!.action).toBe('merged');
    expect(r.db[0]!.status).toBe('canceled');
  });

  it('부분취소: 원래 금액으로 들어와 있던 내역의 금액을 고친다', () => {
    const db = ingest([], extraction([{ date: '2026-11-01', merchant: '교통앱', amount: 30200, payment_label: '네이버 현대카드' }])).db;
    const r = ingest(db, extraction([{ date: '2026-11-01', merchant: '교통앱', amount: 4400, original_amount: 30200, status: 'partial_canceled', payment_label: '네이버 현대카드' }]));
    expect(r.decisions[0]!.action).toBe('merged');
    expect(r.db).toHaveLength(1);
    expect(r.db[0]!.amount).toBe(4400);
  });

  it('한 원문 안에서 바로 붙은, 이름이 다른 같은 금액 쌍은 확인 필요로 연결된다', () => {
    const r = ingest(
      [],
      extraction([
        { date: '2026-11-09', merchant: '코레일', amount: 36900 },
        { date: '2026-11-09', merchant: '철도승차권발매', amount: 36900, payment_label: '네이버 현대카드' },
      ]),
    );
    const [korail, card] = r.decisions;
    expect(card!.action).toBe('created');
    expect(korail!.action).toBe('review');
    expect(korail!.tx.review?.duplicate_of).toBe(card!.tx.id);
  });

  it('떨어져 있는 같은 금액 줄은 의심하지 않는다', () => {
    const r = ingest(
      [],
      extraction([
        { date: '2026-10-21', merchant: '더벤티', amount: 3900, payment_label: '달달하나 체크카드' },
        { date: '2026-10-21', merchant: '다이소', amount: 13000, payment_label: '달달하나 체크카드' },
        { date: '2026-10-21', merchant: '주식회사 카카오', amount: 3900 },
      ]),
    );
    expect(r.decisions.map((d) => d.action)).toEqual(['created', 'created', 'created']);
  });

  it('잘린 줄로 다시 보인 지역화폐 결제도 하나로 합쳐진다(잔액 차감 줄과 함께 와도)', () => {
    let db = ingest([], extraction([
      { date: '2026-11-11', merchant: '비엔엠홀딩스(주)', amount: 21371 },
      { date: '2026-11-11', merchant: '비엔엠홀딩스(주)', amount: 21960, payment_label: '세종 여민전 하나멤버스 1Q체크카드' },
    ])).db;
    expect(db).toHaveLength(1);
    db = ingest(db, extraction([
      { date: '2026-11-11', merchant: '비엔엠홀딩스(주)', amount: 21371 },
      { date: '2026-11-11', merchant: '비엔엠홀딩스(주)', amount: 21960 },
    ])).db;
    expect(db).toHaveLength(1);
    expect(db[0]!.amount).toBe(21960);
  });

  it('다음 날의 할인 결제(원래 금액이 같음)를 전날 결제와 합치지 않는다', () => {
    const db = ingest([], extraction([{ date: '2026-11-10', merchant: '일레클', amount: 2150, payment_label: '달달하나 체크카드' }])).db;
    const r = ingest(db, extraction([{ date: '2026-11-11', merchant: '일레클', amount: 264, original_amount: 2150, payment_label: '달달하나 체크카드' }]));
    expect(r.decisions[0]!.action).toBe('created');
    expect(r.db.map((t) => t.amount).sort((a, b) => a - b)).toEqual([264, 2150]);
  });

  it('캡처끼리는 날짜가 다르면 같은 결제로 보지 않는다', () => {
    const db = ingest([], extraction([{ date: '2026-11-01', merchant: '교회', amount: 20000, payment_label: '내 하나 계좌' }])).db;
    const r = ingest(db, extraction([{ date: '2026-11-02', merchant: '교회', amount: 20000, payment_label: '내 하나 계좌' }]));
    expect(r.decisions[0]!.action).toBe('created');
  });

  it('다른 카드로 낸 같은 금액은 절대 합치지 않는다', () => {
    const db = ingest([], extraction([{ merchant: '마트', amount: 10000, payment_label: '네이버 현대카드' }])).db;
    const r = ingest(db, extraction([{ merchant: '마트', amount: 10000, payment_label: '달달하나 체크카드' }]));
    expect(r.decisions[0]!.action).toBe('created');
  });

  it('사용자가 고친 내역은 금액을 바꾸지 않는다', () => {
    const edited = makeTx({ id: 'e', merchant: '교통앱', amount: 30200, occurred_at: '2026-11-01T03:00:00Z', has_time: false, payment_method_id: 'pm-card', source: 'screenshot', field_sources: { user_edited: 'true' } });
    const r = ingest([edited], extraction([{ date: '2026-11-01', merchant: '교통앱', amount: 4400, original_amount: 30200, status: 'partial_canceled', payment_label: '네이버 현대카드' }]));
    expect(r.db[0]!.amount).toBe(30200);
  });

  it('새 내역의 날짜·현금일·결제수단·카테고리', () => {
    const r = ingest([], extraction([{ date: '2026-11-13', time: '12:10', merchant: '국밥집', amount: 10000, payment_label: '네이버 현대카드', category_hint: '식비' }]));
    const tx = r.db[0]!;
    expect(toKstDate(tx.occurred_at)).toBe('2026-11-13');
    expect(tx.cash_date).toBe('2026-12-14');
    expect(tx.splits).toEqual([{ category_id: 'c-food', amount: 10000 }]);
    expect(tx.source).toBe('screenshot');
    expect(tx.member_id).toBe('me');
  });
});

// ── 페이 앱 결제내역(네이버페이 등) ──────────────────────────────────────────
describe('페이 앱 내역', () => {
  const np = (over: Partial<ExtractedItem>) => ({ payment_label: '네이버페이', ...over });

  it('이름이 달라도 같은 날 같은 금액이면 합치고, 시각과 실제 이름(메모)을 채운다', () => {
    const db = ingest([], extraction([{ date: '2026-11-13', merchant: '결제대행 정기결제', amount: 29000, payment_label: '네이버 현대카드' }])).db;
    const r = ingest(db, extraction([np({ date: '2026-11-13', time: '12:10', merchant: 'AI 구독', amount: 29000 })], 'pay_history'));
    expect(r.decisions[0]!.action).toBe('merged');
    expect(r.db).toHaveLength(1);
    expect(r.db[0]!.has_time).toBe(true);
    expect(r.db[0]!.memo).toContain('네이버페이: AI 구독');
    expect(r.db[0]!.payment_method_id).toBe('pm-card');
  });

  it('포인트 차감 전 금액(카드의 원래 금액)으로도 맞춘다', () => {
    const db = ingest([], extraction([{ date: '2026-11-08', merchant: '인테리어앱', amount: 12890, original_amount: 13900, payment_label: '네이버 현대카드' }])).db;
    const r = ingest(db, extraction([np({ date: '2026-11-08', time: '16:12', merchant: '원목 옷걸이', amount: 13900 })], 'pay_history'));
    expect(r.decisions[0]!.action).toBe('merged');
    expect(r.db).toHaveLength(1);
    expect(r.db[0]!.amount).toBe(12890);
  });

  it('페이 앱이 먼저 들어와도: 나중 카드 내역이 실제 결제수단을 채운다', () => {
    const db = ingest([], extraction([np({ date: '2026-11-12', time: '17:39', merchant: '철도승차권(한국철도)', amount: 40300 })], 'pay_history')).db;
    const r = ingest(db, extraction([{ date: '2026-11-12', merchant: '코레일', amount: 40300, payment_label: '네이버 현대카드' }]));
    expect(r.decisions[0]!.action).toBe('merged');
    expect(r.db[0]!.payment_label).toBe('네이버 현대카드');
    expect(r.db[0]!.payment_method_id).toBe('pm-card');
    expect(r.db[0]!.cash_date).toBe('2026-12-14');
  });

  it('날짜가 다르면 페이 앱 내역이라도 합치지 않는다', () => {
    const db = ingest([], extraction([{ date: '2026-11-10', merchant: '일레클', amount: 2150, payment_label: '달달하나 체크카드' }])).db;
    const r = ingest(db, extraction([np({ date: '2026-11-11', time: '08:53', merchant: '쏘카일레클 라이딩', amount: 2150 })], 'pay_history'));
    expect(r.decisions[0]!.action).toBe('created');
  });

  it('여러 주문이 카드에서 한 번에 결제된 경우: 주문 쪽이 나중이면 넣지 않는다', () => {
    const db = ingest([], extraction([{ date: '2026-11-02', merchant: '리본글로벌', amount: 37751, original_amount: 37800, payment_label: '네이버 현대카드' }])).db;
    const r = ingest(db, extraction([np({ date: '2026-11-02', time: '04:55', merchant: '고양이모래 A', amount: 21750 }), np({ date: '2026-11-02', time: '04:55', merchant: '고양이모래 B', amount: 16050 })], 'pay_history'));
    expect(r.decisions.map((d) => d.action)).toEqual(['duplicate', 'duplicate']);
    expect(r.db).toHaveLength(1);
  });

  it('여러 주문이 카드에서 한 번에 결제된 경우: 카드 쪽이 나중이면 카드 결제를 넣지 않는다', () => {
    const db = ingest([], extraction([np({ date: '2026-11-02', time: '04:55', merchant: '고양이모래 A', amount: 21750 }), np({ date: '2026-11-02', time: '04:55', merchant: '고양이모래 B', amount: 16050 })], 'pay_history')).db;
    const r = ingest(db, extraction([{ date: '2026-11-02', merchant: '리본글로벌', amount: 37751, original_amount: 37800, payment_label: '네이버 현대카드' }]));
    expect(r.decisions[0]!.action).toBe('duplicate');
    expect(r.db).toHaveLength(2);
  });

  it('함께 결제된 주문이 서로 다른 조각에 있어도 하나로 맞춘다(앞 조각 주문은 지운다)', () => {
    let db = ingest([], extraction([{ date: '2026-11-02', merchant: '리본글로벌', amount: 37751, original_amount: 37800, payment_label: '네이버 현대카드' }])).db;
    db = ingest(db, extraction([np({ date: '2026-11-02', time: '04:55', merchant: '고양이모래 A', amount: 21750 })], 'pay_history')).db;
    expect(db.filter((t) => !t.deleted_at)).toHaveLength(2);
    const r = ingest(db, extraction([np({ date: '2026-11-02', time: '04:55', merchant: '고양이모래 B', amount: 16050 })], 'pay_history'));
    const live = r.db.filter((t) => !t.deleted_at);
    expect(live).toHaveLength(1);
    expect(live[0]!.merchant).toBe('리본글로벌');
  });

  it('조각 겹침으로 같은 주문이 다시 보여도 함께 결제된 주문 규칙이 걸린다', () => {
    let db = ingest([], extraction([{ date: '2026-11-02', merchant: '리본글로벌', amount: 37751, original_amount: 37800, payment_label: '네이버 현대카드' }])).db;
    db = ingest(db, extraction([np({ date: '2026-11-02', time: '04:55', merchant: '고양이모래', amount: 21750 })], 'pay_history')).db;
    const r = ingest(db, extraction([np({ date: '2026-11-02', time: '04:55', merchant: '고양이모래', amount: 21750 }), np({ date: '2026-11-02', time: '04:55', merchant: '고양이모래', amount: 16050 })], 'pay_history'));
    expect(r.db.filter((t) => !t.deleted_at).map((t) => t.merchant)).toEqual(['리본글로벌']);
  });

  it('회색으로 읽혀도 이체다운 단서가 없으면(사람 이름 송금) 이체로 보지 않는다', () => {
    const cands = normalizeExtraction(
      extraction([
        { merchant: '홍길동', amount: 100000, greyed: true, payment_label: '내 iM뱅크 계좌' },
        { merchant: '내 계좌 이체', amount: 140000, greyed: true, payment_label: '토스뱅크 → iM뱅크' },
        { merchant: '현대카드', amount: 259727, greyed: true, payment_label: '내 하나은행 계좌' },
      ]),
      ctx(),
    );
    expect(cands.map((c) => c.kind)).toEqual(['expense', 'transfer', 'transfer']);
  });

  it('페이 앱 화면의 흐린 글씨(회색)는 이체 표시로 보지 않는다', () => {
    const cands = normalizeExtraction(extraction([np({ merchant: '하이패스 자동충전', amount: 50000, greyed: true })], 'pay_history'), ctx());
    expect(cands[0]!.kind).toBe('expense');
  });

  it('하이패스·교통카드 충전은 지출, 페이·지역화폐 충전은 이체', () => {
    const cands = normalizeExtraction(extraction([np({ merchant: '하이패스 자동충전', amount: 50000 }), { merchant: '네이버페이 충전', amount: 50000 }]), ctx());
    expect(cands.map((c) => c.kind)).toEqual(['expense', 'transfer']);
  });

  it('페이 이름은 결제수단으로 자동 연결하지 않는다(안에 든 카드가 진짜 결제수단)', () => {
    expect(resolvePaymentMethod('네이버페이', null, [...methods, pm('pm-naver', '네이버 현대카드', 'credit_card')])).toBeNull();
    expect(resolvePaymentMethod('네이버페이', null, [...methods, pm('pm-np', '네이버페이', 'easy_pay')])?.id).toBe('pm-np');
  });
});

describe('이체 판단은 규칙이 한다', () => {
  it('AI 가 사람 송금·대출이자를 이체라고 해도, 회색·충전·이체 규칙이 아니면 지출로 둔다', async () => {
    const { coerceExtraction } = await import('./coerce.ts');
    const ex = coerceExtraction({
      source_kind: 'toss_list',
      items: [
        { date: '2026-10-21', merchant: '홍길동', amount: 6000, kind: 'transfer', status: 'approved', greyed: false },
        { date: '2026-10-26', merchant: '대출이자', amount: 62889, kind: 'transfer', status: 'approved', greyed: false },
        { date: '2026-11-13', merchant: '내 계좌 이체', amount: 140000, kind: 'expense', status: 'approved', greyed: true },
        { date: '2026-11-01', merchant: '충전', amount: 300000, kind: 'income', status: 'approved', greyed: false, payment_label: '여민전' },
      ],
    });
    expect(normalizeExtraction(ex, ctx()).map((c) => c.kind)).toEqual(['expense', 'expense', 'transfer', 'transfer']);
  });

  it('결제수단 표시 이름의 띄어쓰기·화살표 차이는 같은 이름으로 본다', () => {
    const db = ingest([], extraction([{ date: '2026-11-13', merchant: '내 계좌 이체', amount: 140000, greyed: true, payment_label: '토스뱅크 → iM뱅크' }])).db;
    const r = ingest(db, extraction([{ date: '2026-11-13', merchant: '내 계좌 이체', amount: 140000, greyed: true, payment_label: '토스뱅크→iM뱅크' }]));
    expect(r.decisions[0]!.action).toBe('duplicate');
  });
});

// ── 문자 ──────────────────────────────────────────────────────────────────
describe('parseSms', () => {
  const today = '2026-11-14';
  it('카드 승인 (여러 줄)', () => {
    const r = parseSms('[Web발신]\n현대카드 M 승인\n홍*동\n12,500원 일시불\n11/13 12:30\n스타벅스 세종점\n누적1,234,560원', today);
    expect(r?.items[0]).toMatchObject({ date: '2026-11-13', time: '12:30', merchant: '스타벅스 세종점', amount: 12500, status: 'approved', kind: 'expense' });
    expect(r?.items[0]?.payment_label).toContain('현대카드');
  });

  it('카드 승인 (한 줄, 끝 4자리, 할부)', () => {
    const r = parseSms('신한카드(1234)승인 홍*동 900,000원(3개월)11/07 15:20 하이마트 누적2,000,000원', today);
    expect(r?.items[0]).toMatchObject({ amount: 900000, card_last4: '1234', installment_months: 3, merchant: '하이마트', date: '2026-11-07' });
  });

  it('취소 문자', () => {
    const r = parseSms('[Web발신]\nKB국민카드1234취소\n홍*동님\n18,100원\n11/06 09:10\n코레일', today);
    expect(r?.items[0]).toMatchObject({ status: 'canceled', amount: 18100, merchant: '코레일' });
  });

  it('입금 문자', () => {
    const r = parseSms('[하나] 11/08 10:21\n입금 210,000원\n홍길동\n잔액 1,000,000원', today);
    expect(r?.items[0]).toMatchObject({ kind: 'income', amount: 210000, merchant: '홍길동', date: '2026-11-08' });
  });

  it('연초에 받은 지난해 12월 문자', () => {
    expect(parseSms('현대카드 승인\n12,000원 일시불\n12/31 23:50\n편의점', '2027-01-02')?.items[0]?.date).toBe('2026-12-31');
  });

  it('모르는 형식은 null (AI 로 넘긴다)', () => {
    expect(parseSms('오늘 저녁 뭐 먹지', today)).toBeNull();
    expect(parseSms('이벤트! 최대 50,000원 할인', today)).toBeNull();
  });
});

describe('우리끼리 이체 양쪽 기록', () => {
  it('은행 쪽 충전과 지역화폐 앱 쪽 충전은 하나', () => {
    const db = ingest([], extraction([{ date: '2026-11-01', merchant: '코나아이 충전', amount: 300000, greyed: true, payment_label: '하나 → 여민전' }])).db;
    const r = ingest(db, extraction([{ date: '2026-11-01', time: '10:16', merchant: '여민전 충전', amount: 300000, kind: 'income', payment_label: '여민전' }], 'local_currency_app'));
    expect(r.decisions[0]!.action).toBe('merged');
    expect(r.db).toHaveLength(1);
  });
});

describe('연도 바로잡기', () => {
  it('목록 캡처에서 작년으로 잘못 읽은 날짜는 올해로', async () => {
    const { fixYear } = await import('./normalize.ts');
    expect(fixYear('2025-10-31', '2026-11-14', 'toss_list')).toBe('2026-10-31');
    expect(fixYear('2026-10-31', '2026-11-14', 'toss_list')).toBe('2026-10-31');
    // 올해로 옮기면 미래가 되는 날짜(작년 12월 내역)는 그대로
    expect(fixYear('2025-12-20', '2026-01-05', 'toss_list')).toBe('2025-12-20');
    // 영수증은 연도가 찍혀 있으니 그대로
    expect(fixYear('2025-10-31', '2026-11-14', 'receipt')).toBe('2025-10-31');
  });
});

describe('잘못 이체로 보던 경우', () => {
  it('체크카드로 낸 결제의 회색(취소) 줄은 이체가 아니다', () => {
    const cands = normalizeExtraction(extraction([{ merchant: '철도승차권 발매', amount: 16900, status: 'canceled', greyed: true, payment_label: '토스뱅크 체크카드' }]), ctx());
    expect(cands[0]!.kind).toBe('expense');
  });
  it("AI 가 잘린 줄에 붙인 '(상품명 잘림)' 은 버린다", () => {
    expect(normalizeExtraction(extraction([{ merchant: '(상품명 잘림)', amount: 14200 }]), ctx())).toHaveLength(0);
  });
});

describe('온통대전', () => {
  it('결제요청금액(캐시백 포함)과 캐시백 뺀 사용금액 줄은 하나로, 상세 화면의 시각·승인번호를 보충', () => {
    let db = ingest([], extraction([
      { date: '2026-10-09', merchant: '(주)꾸드뱅', amount: 10962 },
      { date: '2026-10-09', merchant: '(주)꾸드뱅', amount: 16200, payment_label: '대전 온통대전 체크카드' },
    ])).db;
    expect(db).toHaveLength(1);
    expect(db[0]!.amount).toBe(16200);
    db = ingest(db, extraction([{ date: '2026-10-09', time: '14:06', merchant: '(주)꾸드뱅', amount: 16200, approval_no: '00000001', payment_label: '온통대전 꿈돌이카드(까꿍)' }], 'local_currency_app')).db;
    expect(db).toHaveLength(1);
    expect(db[0]!.has_time).toBe(true);
    expect(db[0]!.approval_no).toBe('00000001');
  });

  it("'온통대전 충전'은 우리끼리 이체", () => {
    const cands = normalizeExtraction(extraction([{ merchant: '온통대전 충전', amount: 300000, payment_label: '온통대전 꿈돌이카드' }], 'local_currency_app'), ctx());
    expect(cands[0]!.kind).toBe('transfer');
  });
});
