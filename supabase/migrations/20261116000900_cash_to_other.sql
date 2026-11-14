-- 현금은 이제 사람마다 기타 그룹의 💵현금(기본 자산)으로 둔다.
-- 예전에 가족 공용으로 만들어 둔 '현금' 그룹 자산은 쓴 내역·정기 지출이 없으면 지운다(쓴 것은 그대로 둔다).
update public.payment_methods p
set deleted_at = now()
where p.type = 'cash'
  and p.owner_member_id is null
  and p.deleted_at is null
  and not exists (
    select 1 from public.transactions t
    where t.payment_method_id = p.id
       or t.payments @> jsonb_build_array(jsonb_build_object('payment_method_id', p.id))
  )
  and not exists (select 1 from public.recurring_rules r where r.template ->> 'payment_method_id' = p.id::text);
