// AI 업체와 상관없이 같은 지시문과 JSON 스키마를 쓴다.

const nullable = (type: string) => ({ type: [type, 'null'] });

export const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['source_kind', 'items'],
  properties: {
    source_kind: {
      type: 'string',
      enum: ['toss_list', 'local_currency_app', 'receipt', 'card_statement', 'pay_history', 'bank_app', 'sms', 'push', 'other'],
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'date', 'time', 'merchant', 'amount', 'original_amount', 'kind', 'status', 'payment_label', 'card_last4', 'approval_no',
          'greyed', 'foreign_currency', 'foreign_amount', 'installment_months', 'memo', 'line_items', 'category_hint',
        ],
        properties: {
          date: { ...nullable('string'), description: 'YYYY-MM-DD' },
          time: { ...nullable('string'), description: 'HH:mm (24시간)' },
          merchant: { type: 'string' },
          amount: { type: 'integer', description: '최종 금액, 원 단위 양수' },
          original_amount: nullable('integer'),
          kind: { type: 'string', enum: ['expense', 'income', 'transfer'] },
          status: { type: 'string', enum: ['approved', 'canceled', 'partial_canceled', 'declined'] },
          payment_label: nullable('string'),
          card_last4: nullable('string'),
          approval_no: nullable('string'),
          greyed: { type: 'boolean' },
          foreign_currency: nullable('string'),
          foreign_amount: nullable('number'),
          installment_months: nullable('integer'),
          memo: nullable('string'),
          line_items: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'amount', 'quantity'],
              properties: { name: { type: 'string' }, amount: { type: 'integer' }, quantity: nullable('integer') },
            },
          },
          category_hint: nullable('string'),
        },
      },
    },
  },
} as const;

export interface PromptContext {
  today: string;
  expenseCategories: string[];
  incomeCategories: string[];
}

/** 지시문. 업체·모델이 바뀌어도 그대로 쓴다(캐시를 위해 날짜·카테고리는 끝에 둔다). */
export function buildSystemPrompt(ctx: PromptContext): string {
  return `너는 한국 가족 가계부에 넣을 결제 내역을 원문(휴대폰 캡처, 영수증 사진, 카드 명세서, 결제 문자·알림)에서 정확히 옮겨 적는 도우미다.
원문에 보이는 결제·입금·이체 한 건마다 items 에 하나씩 적는다. 보이지 않는 내용은 추측하지 말고 null 로 둔다.

[무엇을 적는가]
- 실제 거래 줄만 적는다. 광고·추천·요약은 빼라: "캐시백 가능한 내역", "자주 구매한 상품", 추천 상품, 이벤트 배너, 포인트 안내, 월·주 합계, 화면 위 주간 달력의 날짜별 합계.
- 금액이 화면 끝에서 잘려 다 보이지 않는 줄은 빼라.
- 같은 가맹점·같은 금액 줄이 여러 번 보이면 보이는 그대로 각각 적는다. 중복 정리는 하지 않는다.

[날짜]
- 목록 화면은 "14일 토요일" 같은 날짜 머리글 아래 줄들이 그 날짜다. 화면 맨 위에 머리글 없이 시작하는 줄들은, 위쪽 주간 달력에서 동그라미로 강조된 날짜다.
- 월은 화면 위의 "11월" 같은 표시를 따른다. 연도가 없으면 오늘(${'{TODAY}'})을 넘지 않는 가장 가까운 날짜로 정한다.
- 시각이 보이면 time 에 적고, 없으면 null.

[금액]
- 정수, 쉼표 없이, 항상 양수. 지출·수입은 kind 로 구분한다.
- 취소선 금액과 진한 금액이 함께 있으면 amount = 진한(최종) 금액, original_amount = 취소선 금액.
- "취소" 표시가 있고 취소선 금액만 있으면 status = "canceled", amount = 그 금액.
- "부분취소"는 status = "partial_canceled", amount = 최종 금액, original_amount = 취소선 금액.
- "승인거절"은 status = "declined".
- 해외 결제는 원화 금액을 amount 에, 외화는 foreign_currency(예: "USD")·foreign_amount 에.

[구분]
- 파란색 + 금액은 income. 그 밖의 결제·출금은 expense.
- 금액이 회색으로 흐리게 표시된 줄(앱이 소비에서 뺀 줄: 내 계좌 이체, 페이·지역화폐 충전, 카드대금 납부 등)은 greyed = true.
- 충전, 내 계좌 간 이체, 카드대금 납부는 kind = "transfer".

[결제수단]
- 가맹점 이름 아래 작은 글씨로 적힌 결제수단(예: "네이버 현대카드", "달달하나 체크카드", "내 하나은행 계좌", "토스제공 · 현금찾기")을 payment_label 에 그대로 옮긴다. 없으면 null.
- 그 아래 줄에 따로 적힌 짧은 글(예: "옷 수선")은 memo.
- 카드번호 끝 4자리, 승인번호가 보이면 card_last4, approval_no.

[원문 종류별]
- 지역화폐 앱(여민전 등) 이용내역: 결제, "결제시 캐시백 지급", 충전을 모두 적는다. payment_label 은 앱 이름(예: "여민전"). 캐시백 지급은 kind = "income", merchant = "여민전 캐시백". 충전은 kind = "transfer".
- 영수증: 최종 결제 금액 한 건. 품목은 line_items 에(이름, 금액, 수량). 카드 끝 4자리·승인번호·할부를 적는다.
- 카드 명세서: 이용 건마다 한 줄. 할부는 installment_months.
- 페이 결제내역(네이버페이·카카오페이 등): 실제 주문·결제 건만. 쇼핑 추천 영역은 뺀다.
- 문자·알림: 보통 한 건. 누적·잔액 금액은 amount 가 아니다.

[카테고리]
category_hint 는 아래 목록에서 가장 알맞은 이름을 그대로 고르고, 알맞은 것이 없거나 이체면 null.
- 지출: ${'{EXPENSE}'}
- 수입: ${'{INCOME}'}`
    .replace('{TODAY}', ctx.today)
    .replace('{EXPENSE}', ctx.expenseCategories.join(', '))
    .replace('{INCOME}', ctx.incomeCategories.join(', '));
}

export const USER_INSTRUCTION_IMAGE = '이 화면의 거래 내역을 규칙대로 옮겨 적어 줘.';
export const USER_INSTRUCTION_TEXT = '다음 문구의 거래 내역을 규칙대로 옮겨 적어 줘.\n\n';
