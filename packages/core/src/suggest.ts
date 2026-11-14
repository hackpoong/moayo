// 제목(가맹점·내용)으로 카테고리를 추천한다. AI 를 부르지 않는다.
//  1) 같은 가족이 예전에 같은 이름에 붙인 카테고리(가장 많이 쓴 것)
//  2) 이름이 겹치는 예전 기록
//  3) 낱말 사전(기본 카테고리 이름 기준)

import { normalizeMerchant } from './ingest/text.ts';
import type { Category, CategoryKind, Transaction } from './types.ts';

const KEYWORDS: Record<string, string[]> = {
  '카페·간식': ['카페', '커피', '스타벅스', '투썸', '메가커피', '메가mgc', '빽다방', '이디야', '컴포즈', '더벤티', '할리스', '폴바셋', '베이커리', '파리바게뜨', '뚜레쥬르', '빵', '도넛', '크리스피', '던킨', '아이스크림', '배스킨', '설빙', '디저트', '앤티앤스', '공차'],
  식비: ['식당', '밥', '국밥', '김밥', '분식', '치킨', '피자', '버거', '맥도날드', '롯데리아', '버거킹', '맘스터치', '마트', '이마트', '홈플러스', '롯데마트', '코스트코', '트레이더스', '하나로', '반찬', '정육', '배달의민족', '배민', '요기요', '쿠팡이츠', '감자탕', '갈비', '고기', '초밥', '횟집', '짜장', '중국집', '만두', '국수', '냉면', '떡볶이', '도시락', '장터', '싱싱'],
  생활용품: ['다이소', '아성다이소', '생활', '세제', '휴지', '모던하우스', '오늘의집', '이케아', '쿠팡', '올리브영', '편의점', 'gs25', 'cu', '세븐일레븐', '이마트24', '모래'],
  '교통·차량': ['주유', '주유소', 'sk에너지', 'gs칼텍스', '에쓰오일', '현대오일뱅크', '택시', '카카오t', '버스', '철도', '코레일', '승차권', 'ktx', 'srt', '고속버스', '티머니', '주차', '파킹', '하이패스', '톨게이트', '도로공사', '통행료', '휴게소', '일레클', '킥보드', '쏘카', '세차', '정비', '타이어', '일렉링크', '충전소'],
  '의료·건강': ['병원', '의원', '약국', '치과', '한의원', '안과', '내과', '소아과', '피부과', '정형외과', '이비인후과', '검진', '동물병원'],
  통신: ['skt', 'sk텔레콤', 'kt', 'lgu', 'lg유플러스', 'u+', '통신요금', '알뜰폰', '인터넷'],
  '주거·관리비': ['관리비', '전기요금', '한전', '가스', '도시가스', '수도', '월세', '렌탈', '청소'],
  교육: ['학원', '교재', '서점', '교보문고', '영풍문고', '예스24', '알라딘', '학습지', '수강', '강의'],
  육아: ['키즈', '유아', '아기', '기저귀', '분유', '장난감', '토이저러스'],
  '의류·미용': ['미용실', '헤어', '네일', '옷', '의류', '유니클로', '무신사', '자라', '탑텐', '스파오', '신발', '수선'],
  '문화·여가': ['영화', 'cgv', '메가박스', '롯데시네마', '넷플릭스', '유튜브', 'youtube', '디즈니', '티빙', '웨이브', '멜론', '스포티파이', '공연', '전시', '놀이공원', '캠핑', '여행', '호텔', '펜션', '숙박', '게임', '플레이스테이션'],
  '경조사·선물': ['축의', '부의', '조의', '선물', '꽃', '화환', '케이크'],
  '보험·금융': ['보험', '이자', '대출', '수수료', '카드연회비', '연회비'],
  급여: ['급여', '월급', '상여', '수당', '보조비', '급식비', '활동비'],
  금융수입: ['이자', '분배금', '배당', '환급'],
  용돈: ['용돈'],
  기타수입: ['캐시백', '포인트', '환불'],
};

type HistoryRow = Pick<Transaction, 'merchant' | 'splits' | 'kind' | 'deleted_at' | 'payment_method_id'>;

export interface Suggestion {
  categoryId: string | null;
  /** 예전에 같은 이름에 쓴 결제수단. */
  paymentMethodId: string | null;
  reason: 'history' | 'similar' | 'keyword' | null;
}

export function suggestFromTitle(
  title: string,
  kind: CategoryKind,
  categories: readonly Category[],
  history: readonly HistoryRow[],
): Suggestion {
  const key = normalizeMerchant(title);
  const live = categories.filter((c) => c.kind === kind && !c.archived && !c.deleted_at);
  const none: Suggestion = { categoryId: null, paymentMethodId: null, reason: null };
  if (key.length < 1) return none;

  const pick = (match: (merchantKey: string) => boolean, reason: Suggestion['reason']): Suggestion | null => {
    const catCount = new Map<string, number>();
    let pm: string | null = null;
    for (const tx of history) {
      if (tx.deleted_at || tx.kind !== kind) continue;
      const mk = normalizeMerchant(tx.merchant);
      if (!mk || !match(mk)) continue;
      pm ??= tx.payment_method_id;
      const cat = tx.splits.length === 1 ? tx.splits[0]!.category_id : null;
      if (cat && live.some((c) => c.id === cat)) catCount.set(cat, (catCount.get(cat) ?? 0) + 1);
    }
    const best = [...catCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return best || pm ? { categoryId: best, paymentMethodId: pm, reason } : null;
  };

  const exact = pick((mk) => mk === key, 'history');
  if (exact?.categoryId) return exact;
  const similar = key.length >= 2 ? pick((mk) => mk.length >= 2 && (mk.includes(key) || key.includes(mk)), 'similar') : null;
  if (similar?.categoryId) return { ...similar, paymentMethodId: exact?.paymentMethodId ?? similar.paymentMethodId };

  const lower = title.toLowerCase().replace(/\s/g, '');
  for (const [name, words] of Object.entries(KEYWORDS)) {
    if (!words.some((w) => lower.includes(w.replace(/\s/g, '')))) continue;
    const cat = live.find((c) => c.name === name);
    if (cat) return { categoryId: cat.id, paymentMethodId: exact?.paymentMethodId ?? similar?.paymentMethodId ?? null, reason: 'keyword' };
  }
  return { categoryId: null, paymentMethodId: exact?.paymentMethodId ?? similar?.paymentMethodId ?? null, reason: null };
}
