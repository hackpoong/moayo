-- 병합: 합쳐진 원래 내역은 status 'merged' 로 남긴다(목록·합계 제외, 다시 불러와도 되살리지 않음).
alter table public.transactions drop constraint if exists transactions_status_check;
alter table public.transactions add constraint transactions_status_check
  check (status in ('confirmed', 'review', 'canceled', 'merged'));

-- '앞으로도 계속 바꾸기': 이 이름으로 들어오는 내역은 제목·분류·자산을 바꿔 넣는다.
create table if not exists public.merchant_rules (
  id                     uuid primary key default gen_random_uuid(),
  household_id           uuid not null references public.households (id) on delete cascade,
  match_key              text not null check (char_length(match_key) between 1 and 80),
  set_merchant           text check (set_merchant is null or char_length(set_merchant) <= 60),
  set_category_id        uuid,
  set_payment_method_id  uuid,
  created_by             uuid,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz
);
create index if not exists merchant_rules_sync_idx on public.merchant_rules (household_id, updated_at);

create trigger merchant_rules_touch before insert or update on public.merchant_rules
  for each row execute function public.touch_updated_at();
create trigger merchant_rules_fixed_household before update on public.merchant_rules
  for each row execute function public.forbid_household_change();
create trigger merchant_rules_created_by before insert or update on public.merchant_rules
  for each row execute function public.stamp_created_by();

alter table public.merchant_rules enable row level security;
grant select, insert, update on public.merchant_rules to authenticated;
create policy merchant_rules_select on public.merchant_rules for select to authenticated using (public.is_member(household_id));
create policy merchant_rules_insert on public.merchant_rules for insert to authenticated with check (public.is_member(household_id));
create policy merchant_rules_update on public.merchant_rules for update to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.merchant_rules;
  end if;
end;
$$;
