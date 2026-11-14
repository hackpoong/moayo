-- 카드번호 전체·유효기간은 자산 화면에 바로 보이도록 그대로 저장한다(사용자 결정).
-- CVC 만 가족 금고로 암호화해 secret 에 둔다.
alter table public.payment_methods add column if not exists card_number text check (card_number is null or card_number ~ '^\d{13,19}$');
alter table public.payment_methods add column if not exists card_expiry text check (card_expiry is null or card_expiry ~ '^(0[1-9]|1[0-2])/\d{2}$');
