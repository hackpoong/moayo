-- 지역화폐·디지털온누리도 체크카드처럼 쓰므로 체크카드 그룹으로 합치고, '카드 성격'으로 구분한다.
alter table public.payment_methods add column if not exists card_kind text
  check (card_kind is null or card_kind in ('general', 'local_currency', 'onnuri'));

update public.payment_methods
set type = 'check_card',
    card_kind = case when name ~ '온누리' then 'onnuri' else 'local_currency' end
where type = 'local_currency';

-- 이미 체크카드로 옮겨 둔 지역화폐(이름으로 알아봄)도 성격을 채운다.
update public.payment_methods
set card_kind = case when name ~ '온누리' then 'onnuri' else 'local_currency' end
where type = 'check_card' and card_kind is null
  and name ~ '(여민전|온통대전|동백전|인천e음|경기지역화폐|chak|지역화폐|온누리)';

-- 기본 기타 자산(현금·포인트·마일리지·상품권)은 이모지 없이 이름만.
update public.payment_methods set icon = null where issuer like 'moayo:%' and icon is not null;
