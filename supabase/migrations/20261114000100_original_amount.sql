-- 할인·포인트·부분취소 전 금액. 페이 앱(포인트 차감 전)과 카드·토스(차감 후) 내역을 맞출 때 쓴다.
alter table public.transactions
  add column if not exists original_amount bigint check (original_amount is null or original_amount >= 0);
