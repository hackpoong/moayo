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
          'date', 'time', 'merchant', 'amount', 'original_amount', 'kind', 'status', 'payment_label', 'card_last4', 'card_number_hint', 'approval_no',
          'greyed', 'foreign_currency', 'foreign_amount', 'installment_months', 'memo', 'line_items', 'category_hint', 'emoji', 'tenders',
        ],
        properties: {
          date: { ...nullable('string'), description: 'YYYY-MM-DD' },
          time: { ...nullable('string'), description: 'HH:mm (24시간)' },
          merchant: { type: 'string' },
          amount: { type: 'integer', description: '최종 금액, 원 단위 양수' },
          original_amount: nullable('integer'),
          kind: { type: 'string', enum: ['expense', 'income'], description: '돈이 나갔으면 expense, 들어왔으면 income' },
          status: { type: 'string', enum: ['approved', 'canceled', 'partial_canceled', 'declined'] },
          payment_label: nullable('string'),
          card_last4: nullable('string'),
          card_number_hint: nullable('string'),
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
          emoji: { ...nullable('string'), description: '가게·품목에 가장 잘 어울리는 이모지 1개. 모르겠으면 null' },
          tenders: {
            type: 'array',
            description: '영수증에서 여러 결제수단으로 나눠 낸 경우의 결제수단별 금액. 한 가지로만 냈거나 영수증이 아니면 빈 배열',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['kind', 'label', 'amount', 'card_number_hint', 'holder'],
              properties: {
                kind: { type: 'string', enum: ['card', 'cash', 'point', 'voucher', 'other'] },
                label: { ...nullable('string'), description: '영수증에 적힌 결제수단 이름(예: 신한프리미엄, 신세계상품권, 마일리지사용)' },
                amount: { type: 'integer', description: '이 결제수단으로 낸 금액(양수)' },
                card_number_hint: { ...nullable('string'), description: '이 결제수단 줄의 카드번호 그대로(가림표 포함)' },
                holder: { ...nullable('string'), description: '포인트·마일리지 회원 이름이 보이면 그대로(예: 김*수)' },
              },
            },
          },
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
- 화면 위·아래 끝에서 잘린 줄·카드(가게 이름, 금액, 날짜 중 하나라도 잘려서 다 보이지 않는 것)는 빼라. 추측해서 채우지 않는다.
- 같은 가맹점·같은 금액 줄이 여러 번 보이면 보이는 그대로 각각 적는다. 중복 정리는 하지 않는다.

[날짜]
- 목록 화면은 "14일 토요일" 같은 날짜 머리글 아래 줄들이 그 날짜다. 화면 맨 위에 머리글 없이 시작하는 줄들은, 위쪽 주간 달력에서 동그라미로 강조된 날짜다.
- 월은 화면 위의 "11월" 같은 표시를 따른다. 연도가 없으면 오늘(맨 아래에 적힌 날짜)을 넘지 않는 가장 가까운 날짜로 정한다.
- 시각이 보이면 time 에 적고, 없으면 null.

[금액]
- 정수, 쉼표 없이, 항상 양수. 지출·수입은 kind 로 구분한다.
- 취소선 금액과 진한 금액이 함께 있으면 amount = 진한(최종) 금액, original_amount = 취소선 금액.
- "취소" 표시가 있고 취소선 금액만 있으면 status = "canceled", amount = 그 금액.
- "부분취소"는 status = "partial_canceled", amount = 최종 금액, original_amount = 취소선 금액.
- "승인거절"은 status = "declined".
- 해외 결제는 원화 금액을 amount 에, 외화는 foreign_currency(예: "USD")·foreign_amount 에.

[구분]
- kind 는 돈의 방향만 적는다: 들어온 돈(파란색 + 금액, 입금, 캐시백 지급, 충전 받음)은 income, 나간 돈은 expense.
  사람에게 보낸 송금·대출이자·충전도 나간 돈이면 expense 다. 이체인지 아닌지는 앱이 따로 판단한다.
- 금액이 회색으로 흐리게 표시된 줄(앱이 소비에서 뺀 줄: 내 계좌 이체, 페이·지역화폐 충전, 카드대금 납부 등)은 greyed = true. 그 밖은 false.

[결제수단]
- 가맹점 이름 아래 작은 글씨로 적힌 결제수단(예: "네이버 현대카드", "달달하나 체크카드", "내 하나은행 계좌", "토스제공 · 현금찾기")을 payment_label 에 그대로 옮긴다. 없으면 null.
- 그 아래 줄에 따로 적힌 짧은 글(예: "옷 수선")은 memo.
- 카드번호 끝 4자리, 승인번호가 보이면 card_last4, approval_no.
- 카드번호가 일부라도 보이면 보이는 모양 그대로 card_number_hint 에 적는다(가림표 포함, 예: "4111-22**-****-1234", "411122", "*1234").

[원문 종류별]
- 지역화폐 앱(여민전·온통대전 등) 이용내역: 결제, "결제시 캐시백 지급", 충전을 모두 적는다. payment_label 은 앱·카드 이름(예: "여민전", "온통대전 꿈돌이카드").
  · 결제 금액은 캐시백을 쓰기 전 전체 금액이다. 결제 상세 화면에 "결제요청금액"과 "사용금액·사용 캐시백"이 함께 있으면 amount = 결제요청금액, 승인번호와 일시도 적는다.
  · 캐시백 지급은 kind = "income", merchant = "<앱 이름> 캐시백"(예: "여민전 캐시백").
  · 가게 이름 없이 "충전"만 있는 줄은 merchant = "<앱 이름> 충전"(예: "온통대전 충전"). 충전은 들어온 돈이 아니라 옮긴 돈이므로 kind 는 expense 로 둔다.
  · 화면 위의 잔액, "충전금액·사용금액" 합계, 조회 기간은 거래가 아니다.
- 영수증: 결제 한 건. 품목은 line_items 에(이름, 금액, 수량). 승인번호·할부를 적는다.
  · amount 는 손님이 실제로 낸 총액('받은금액'·'결제금액 합계'·'합계'에서 할인을 뺀 값)이다. 카드 승인 금액만 적으면 안 된다.
  · 할인 전 '합계'(정가 합)는 original_amount.
  · 여러 결제수단으로 나눠 냈으면(신용카드 + 상품권 + 마일리지·포인트 사용 + 현금 등) 결제수단마다 tenders 에 한 줄씩 적는다. kind: 신용·체크카드 card, 현금 cash, 포인트·마일리지·캐시 사용 point, 상품권·기프트카드 voucher. tenders 금액의 합은 amount 와 같아야 한다.
  · '적립'(SPOINT 적립, 마일리지 적립)은 결제가 아니므로 tenders 에 넣지 않는다. '현금영수증'은 현금으로 낸 금액이 아니라 소득공제 표시라 결제수단이 아니다(상품권·현금 결제분에 붙는다).
  · payment_label 은 금액이 가장 큰 결제수단(보통 카드 이름, 예: 신한프리미엄).
  · card_last4 는 끝 4자리가 모두 숫자로 보일 때만. "51559450****493*" 처럼 끝이 가려져 있으면 card_last4 는 null, card_number_hint 에 그대로.
- 카드 명세서: 이용 건마다 한 줄. 할부는 installment_months.
- 페이 결제내역(네이버페이·카카오페이 등): 카드마다 위에 상태("결제완료", "결제취소", "부분취소", "구매확정완료", "배송완료")가, 그 아래 가게 또는 상품 이름, 금액, "11. 13. 12:10 결제" 같은 날짜·시각이 있다.
  · 상태: "결제취소" = canceled, "부분취소" = partial_canceled(보이는 금액을 amount 에), 나머지는 approved.
  · merchant 는 가게 이름, 쇼핑 주문이면 상품 이름을 앞부분 30자 정도로. 끝의 ">" 는 뺀다.
  · payment_label 은 앱 이름 그대로("네이버페이", "카카오페이").
  · 빼야 하는 것: "관심 있을만한 상품"·"함께 많이 찾는 상품"·"AD" 표시 영역, "구매할 때 되셨나요?", 스토어 광고, "포인트 뽑기", "리뷰쓰고 최대 +150원", "구매확정하고 +2,075원", "결제 적립 +7원 바로 받기", "적립 완료/예정" 안내, 상단의 "3,310원 받기"·"자주 산"·"중고로 팔기", 쪽 번호.
- 문자·알림: 보통 한 건. 누적·잔액 금액은 amount 가 아니다.

[카테고리]
category_hint 는 아래 목록에서 가장 알맞은 이름을 그대로 고르고, 알맞은 것이 없으면 null. 품목을 보고 고른다(예: 테이블·소파·의자·침대·가전제품은 '가구·가전'이 있으면 그것, 휴지·세제는 생활용품).
emoji 는 가게·품목에 가장 잘 어울리는 이모지 하나(예: 맥도날드 🍔, 수목원 🌴, 찜질방 ♨️, 주유소 ⛽, 약국 💊). 확실하지 않으면 null.

[이 가족의 정보 — 위 규칙은 늘 같고, 아래만 바뀐다]
- 오늘: ${'{TODAY}'}
- 지출 카테고리: ${'{EXPENSE}'}
- 수입 카테고리: ${'{INCOME}'}`
    .replace('{TODAY}', ctx.today)
    .replace('{EXPENSE}', ctx.expenseCategories.join(', '))
    .replace('{INCOME}', ctx.incomeCategories.join(', '));
}

export const USER_INSTRUCTION_IMAGE = '이 화면의 거래 내역을 규칙대로 옮겨 적어 줘.';
export const USER_INSTRUCTION_TEXT = '다음 문구의 거래 내역을 규칙대로 옮겨 적어 줘.\n\n';
