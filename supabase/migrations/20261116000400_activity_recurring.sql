-- 누가 언제 불러오고·만들고·고치고·합치고·지웠는지 기록, 그리고 정기 지출(반복) 규칙.

-- ── 마지막으로 고친 사람 ─────────────────────────────────────────────────
alter table public.transactions add column if not exists updated_by uuid;

create or replace function public.stamp_updated_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- 앱에서 고치면 로그인한 사람, 서버 함수(사진·문자 불러오기)는 함께 보낸 값.
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  return new;
end;
$$;
revoke all on function public.stamp_updated_by() from anon, authenticated, public;

drop trigger if exists transactions_stamp_updated_by on public.transactions;
create trigger transactions_stamp_updated_by
  before insert or update on public.transactions
  for each row execute function public.stamp_updated_by();

-- ── 기록 ────────────────────────────────────────────────────────────────
create table if not exists public.activity_log (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  member_id     uuid,
  action        text not null check (action in ('import', 'create', 'update', 'delete', 'restore', 'merge')),
  tx_id         uuid,
  tx_label      text,
  kind          text,
  amount        bigint,
  summary       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists activity_log_sync_idx on public.activity_log (household_id, updated_at);
create index if not exists activity_log_tx_idx on public.activity_log (tx_id);

alter table public.activity_log enable row level security;
grant select on public.activity_log to authenticated;
create policy activity_log_select on public.activity_log for select to authenticated using (public.is_member(household_id));

create or replace function public.log_transaction_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  act text;
  parts text[] := '{}';
  who uuid;
  old_cats text;
  new_cats text;
begin
  if tg_op = 'INSERT' then
    if new.status = 'merged' or new.deleted_at is not null then
      return null;
    end if;
    act := case when new.source = 'manual' and coalesce(new.field_sources ->> 'merged_from', '') <> '' then 'merge'
                when new.source = 'manual' then 'create' else 'import' end;
  else
    if old.deleted_at is null and new.deleted_at is not null then
      act := 'delete';
    elsif old.deleted_at is not null and new.deleted_at is null then
      act := 'restore';
    elsif old.status <> 'merged' and new.status = 'merged' then
      return null; -- 합쳐진 원래 내역은 합친 내역 쪽에 한 번만 남긴다.
    else
      if coalesce(old.merchant, '') <> coalesce(new.merchant, '') then
        parts := array_append(parts, format('제목 %s → %s', coalesce(old.merchant, '-'), coalesce(new.merchant, '-')));
      end if;
      if old.amount <> new.amount or old.kind <> new.kind then
        parts := array_append(parts, format('금액 %s → %s', to_char(old.amount, 'FM999,999,999,990'), to_char(new.amount, 'FM999,999,999,990')));
      end if;
      if old.splits is distinct from new.splits then
        select string_agg(coalesce(c.name, '미분류'), '·') into new_cats
        from jsonb_array_elements(new.splits) s
        left join public.categories c on c.id = (s ->> 'category_id')::uuid;
        parts := array_append(parts, format('분류 %s', coalesce(new_cats, '미분류')));
      end if;
      if old.payment_method_id is distinct from new.payment_method_id or old.payments is distinct from new.payments then
        parts := array_append(parts, format('자산 %s', coalesce((select p.name from public.payment_methods p where p.id = new.payment_method_id), '-')));
      end if;
      if old.occurred_at <> new.occurred_at then
        parts := array_append(parts, format('날짜 %s', to_char(new.occurred_at at time zone 'Asia/Seoul', 'MM.DD')));
      end if;
      if coalesce(old.memo, '') <> coalesce(new.memo, '') then
        parts := array_append(parts, '메모');
      end if;
      if old.tag_ids is distinct from new.tag_ids then
        parts := array_append(parts, '태그');
      end if;
      if old.status <> new.status and new.status in ('confirmed', 'canceled') then
        parts := array_append(parts, case when new.status = 'canceled' then '취소됨' else '확인함' end);
      end if;
      if cardinality(parts) = 0 then
        return null; -- 동기화로 같은 값이 다시 올라온 경우 등
      end if;
      act := 'update';
    end if;
  end if;

  who := new.updated_by;
  insert into public.activity_log (household_id, member_id, action, tx_id, tx_label, kind, amount, summary)
  values (
    new.household_id,
    (select m.id from public.members m where m.household_id = new.household_id and m.user_id = who limit 1),
    act, new.id, new.merchant, new.kind, new.amount,
    nullif(array_to_string(parts, ' · '), '')
  );
  return null;
end;
$$;
revoke all on function public.log_transaction_change() from anon, authenticated, public;

drop trigger if exists transactions_log on public.transactions;
create trigger transactions_log
  after insert or update on public.transactions
  for each row execute function public.log_transaction_change();

-- ── 정기 지출(반복) ──────────────────────────────────────────────────────
create table if not exists public.recurring_rules (
  id                    uuid primary key default gen_random_uuid(),
  household_id          uuid not null references public.households (id) on delete cascade,
  -- 만들 내역의 내용: kind, amount, merchant, memo, splits, payment_method_id, member_id, tag_ids, has_time, time
  template              jsonb not null,
  day_of_month          integer not null check (day_of_month between 1 and 31),
  start_month           text not null check (start_month ~ '^\d{4}-\d{2}$'),
  -- 몇 번 만들지(null 이면 끝 없음)
  times                 integer check (times is null or times between 1 and 600),
  last_generated_month  text check (last_generated_month is null or last_generated_month ~ '^\d{4}-\d{2}$'),
  paused                boolean not null default false,
  created_by            uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);
create index if not exists recurring_rules_sync_idx on public.recurring_rules (household_id, updated_at);

create trigger recurring_rules_touch before insert or update on public.recurring_rules
  for each row execute function public.touch_updated_at();
create trigger recurring_rules_fixed_household before update on public.recurring_rules
  for each row execute function public.forbid_household_change();
create trigger recurring_rules_created_by before insert or update on public.recurring_rules
  for each row execute function public.stamp_created_by();

alter table public.recurring_rules enable row level security;
grant select, insert, update on public.recurring_rules to authenticated;
create policy recurring_rules_select on public.recurring_rules for select to authenticated using (public.is_member(household_id));
create policy recurring_rules_insert on public.recurring_rules for insert to authenticated with check (public.is_member(household_id));
create policy recurring_rules_update on public.recurring_rules for update to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.activity_log;
    alter publication supabase_realtime add table public.recurring_rules;
  end if;
end;
$$;
