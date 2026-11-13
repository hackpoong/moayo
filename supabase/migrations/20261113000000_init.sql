-- 모아요: 초기 스키마 (P0)
-- 원칙
--  * 모든 데이터 행은 household_id 로 가족에 묶이고, RLS 로 가족 구성원만 접근한다.
--  * 동기화용으로 모든 행에 updated_at(서버가 매김) / deleted_at(삭제 표시)을 둔다. 실제 DELETE 는 하지 않는다.
--  * id 는 클라이언트가 만든 UUID 를 그대로 쓴다(오프라인 입력 지원).

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- 공통 트리거 함수
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

-- household_id 와 id 는 한 번 정해지면 바꿀 수 없다(다른 가족으로 행을 옮기는 것 방지).
create or replace function public.forbid_household_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.household_id is distinct from old.household_id or new.id is distinct from old.id then
    raise exception 'household_id and id are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 가족 / 구성원 / 초대
-- ---------------------------------------------------------------------------

create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 40),
  created_by  uuid not null references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table public.members (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 20),
  role          text not null default 'member' check (role in ('owner', 'member')),
  color         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (household_id, user_id)
);
create index members_user_idx on public.members (user_id) where deleted_at is null;

create table public.invites (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  code          text not null unique,
  created_by    uuid not null references auth.users (id),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  used_by       uuid references auth.users (id),
  used_at       timestamptz
);

-- RLS 정책에서 쓰는 판별 함수. security definer 라서 members 의 RLS 를 다시 타지 않는다(재귀 방지).
create or replace function public.is_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.household_id = hid
      and m.user_id = (select auth.uid())
      and m.deleted_at is null
  );
$$;

create or replace function public.is_owner(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.household_id = hid
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
      and m.deleted_at is null
  );
$$;

-- ---------------------------------------------------------------------------
-- 결제수단 / 카테고리 / 태그 / 이체 규칙
-- ---------------------------------------------------------------------------

create table public.payment_methods (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households (id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 30),
  type             text not null check (type in (
                     'cash', 'credit_card', 'check_card', 'bank_account',
                     'local_currency', 'gift_voucher', 'easy_pay')),
  issuer           text,                       -- 카드사·은행 (BC, 현대, 농협 …)
  last4            text check (last4 is null or last4 ~ '^[0-9*]{1,4}$'),
  owner_member_id  uuid,                       -- 주로 쓰는 구성원 (members.id)
  aliases          text[] not null default '{}', -- 문자·푸시에서 이 수단을 찾을 때 쓰는 별칭
  -- 신용카드 청구 규칙: {"closing_day": 1~31(31=말일), "payment_day": 1~31, "payment_month_offset": 1}
  billing          jsonb,
  color            text,
  sort             integer not null default 0,
  archived         boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index payment_methods_sync_idx on public.payment_methods (household_id, updated_at);

create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 30),
  kind          text not null check (kind in ('expense', 'income')),
  icon          text,
  color         text,
  parent_id     uuid,
  sort          integer not null default 0,
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index categories_sync_idx on public.categories (household_id, updated_at);

create table public.tags (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 30),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index tags_sync_idx on public.tags (household_id, updated_at);

-- 이름·계좌 패턴이 맞으면 '이체'로 분류해서 지출·수입 집계에서 뺀다.
-- 가족 간 송금, 본인 계좌 이체, 카드대금 출금, 페이·지역화폐 충전이 대상이다.
create table public.transfer_rules (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  label         text not null check (char_length(label) between 1 and 40),
  match_type    text not null check (match_type in ('name', 'account', 'keyword')),
  pattern       text not null check (char_length(pattern) between 1 and 60),
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index transfer_rules_sync_idx on public.transfer_rules (household_id, updated_at);

-- ---------------------------------------------------------------------------
-- 거래 내역
-- ---------------------------------------------------------------------------

create table public.transactions (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references public.households (id) on delete cascade,
  kind                text not null check (kind in ('expense', 'income', 'transfer')),
  status              text not null default 'confirmed' check (status in ('confirmed', 'review', 'canceled')),
  amount              bigint not null check (amount >= 0),     -- 원 단위 정수
  occurred_at         timestamptz not null,                    -- 발생일(결제·사용한 때)
  has_time            boolean not null default true,           -- false 면 날짜만 아는 내역
  cash_date           date not null,                           -- 실제 현금이 나간(들어온) 날
  cash_date_override  boolean not null default false,          -- 명세서 등으로 직접 정한 값이면 true
  merchant            text,
  memo                text,
  payment_method_id   uuid,
  member_id           uuid,                                    -- 쓴 사람 (members.id)
  installment_months  integer not null default 1 check (installment_months between 1 and 60),
  -- [{"category_id": uuid|null, "amount": int}] 합계는 amount 와 같아야 한다.
  splits              jsonb not null default '[]'::jsonb check (jsonb_typeof(splits) = 'array'),
  tag_ids             jsonb not null default '[]'::jsonb check (jsonb_typeof(tag_ids) = 'array'),
  approval_no         text,
  card_last4          text,
  items               jsonb,                                   -- 영수증 품목(선택)
  source              text not null default 'manual' check (source in (
                        'manual', 'image', 'screenshot', 'statement', 'sms', 'push', 'share')),
  field_sources       jsonb not null default '{}'::jsonb,      -- 필드별 출처
  linked_tx_id        uuid,                                    -- 취소 ↔ 원거래
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create index transactions_sync_idx on public.transactions (household_id, updated_at);
create index transactions_occurred_idx on public.transactions (household_id, occurred_at desc) where deleted_at is null;
create index transactions_match_idx on public.transactions (household_id, amount, occurred_at) where deleted_at is null;

-- splits 합계 검증 (비어 있으면 미분류 전액으로 본다)
create or replace function public.check_transaction_splits()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  total bigint;
begin
  if jsonb_array_length(new.splits) > 0 then
    select coalesce(sum((s ->> 'amount')::bigint), 0) into total
    from jsonb_array_elements(new.splits) as s;
    if total <> new.amount then
      raise exception 'splits total (%) must equal amount (%)', total, new.amount using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger transactions_check_splits
  before insert or update of splits, amount on public.transactions
  for each row execute function public.check_transaction_splits();

-- ---------------------------------------------------------------------------
-- 트리거: updated_at, household_id 고정
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['households', 'members', 'payment_methods', 'categories', 'tags', 'transfer_rules', 'transactions']
  loop
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.touch_updated_at()',
      t || '_touch', t);
  end loop;

  foreach t in array array['members', 'payment_methods', 'categories', 'tags', 'transfer_rules', 'transactions']
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.forbid_household_change()',
      t || '_fixed_household', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 권한: anon 은 아무것도 못 한다. authenticated 는 RLS 를 통과한 행만.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated, public;

alter table public.households      enable row level security;
alter table public.members         enable row level security;
alter table public.invites         enable row level security;
alter table public.payment_methods enable row level security;
alter table public.categories      enable row level security;
alter table public.tags            enable row level security;
alter table public.transfer_rules  enable row level security;
alter table public.transactions    enable row level security;

-- households: 구성원은 읽기, owner 만 이름 변경. 생성은 create_household() 로만.
grant select on public.households to authenticated;
grant update (name) on public.households to authenticated;
create policy households_select on public.households
  for select to authenticated using (public.is_member(id));
create policy households_update on public.households
  for update to authenticated using (public.is_owner(id)) with check (public.is_owner(id));

-- members: 같은 가족은 서로 읽기. 본인 표시 이름·색만 직접 수정. 역할 변경·내보내기는 함수로만.
grant select on public.members to authenticated;
grant update (display_name, color) on public.members to authenticated;
create policy members_select on public.members
  for select to authenticated using (public.is_member(household_id));
create policy members_update_self on public.members
  for update to authenticated
  using (user_id = (select auth.uid()) and deleted_at is null)
  with check (user_id = (select auth.uid()));

-- invites: owner 만 목록 확인. 생성·사용은 함수로만.
grant select on public.invites to authenticated;
create policy invites_select on public.invites
  for select to authenticated using (public.is_owner(household_id));

-- 데이터 테이블: 구성원이면 읽기·추가·수정. DELETE 권한은 주지 않는다(삭제는 deleted_at).
do $$
declare
  t text;
begin
  foreach t in array array['payment_methods', 'categories', 'tags', 'transfer_rules', 'transactions']
  loop
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_member(household_id))',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_member(household_id))',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id))',
      t || '_update', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: 가족 만들기 / 초대 / 합류 / 구성원 관리
-- ---------------------------------------------------------------------------

-- 가족을 만들고, 만든 사람을 owner 로 넣고, 기본 결제수단·카테고리를 채운다.
create or replace function public.create_household(p_name text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  hid uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if (select count(*) from public.members m where m.user_id = uid and m.deleted_at is null) >= 5 then
    raise exception 'too many households' using errcode = '54000';
  end if;

  insert into public.households (name, created_by)
  values (btrim(p_name), uid)
  returning id into hid;

  insert into public.members (household_id, user_id, display_name, role)
  values (hid, uid, btrim(p_display_name), 'owner');

  insert into public.payment_methods (household_id, name, type, sort) values
    (hid, '현금', 'cash', 0),
    (hid, '여민전', 'local_currency', 1),
    (hid, '온누리상품권', 'gift_voucher', 2);

  insert into public.categories (household_id, name, kind, icon, color, sort) values
    (hid, '식비',        'expense', '🍚', '#f97316', 0),
    (hid, '카페·간식',   'expense', '☕', '#a16207', 1),
    (hid, '생활용품',    'expense', '🧻', '#0ea5e9', 2),
    (hid, '주거·관리비', 'expense', '🏠', '#6366f1', 3),
    (hid, '통신',        'expense', '📱', '#8b5cf6', 4),
    (hid, '교통·차량',   'expense', '🚗', '#14b8a6', 5),
    (hid, '의료·건강',   'expense', '💊', '#ef4444', 6),
    (hid, '교육',        'expense', '📚', '#22c55e', 7),
    (hid, '육아',        'expense', '🧸', '#ec4899', 8),
    (hid, '의류·미용',   'expense', '👕', '#d946ef', 9),
    (hid, '문화·여가',   'expense', '🎬', '#f59e0b', 10),
    (hid, '경조사·선물', 'expense', '🎁', '#e11d48', 11),
    (hid, '보험·금융',   'expense', '🏦', '#64748b', 12),
    (hid, '기타',        'expense', '📦', '#94a3b8', 13),
    (hid, '급여',        'income',  '💼', '#16a34a', 0),
    (hid, '부수입',      'income',  '💰', '#65a30d', 1),
    (hid, '용돈',        'income',  '🧧', '#0d9488', 2),
    (hid, '금융수입',    'income',  '📈', '#0284c7', 3),
    (hid, '기타수입',    'income',  '📦', '#94a3b8', 4);

  return hid;
end;
$$;

-- 초대 코드 만들기 (owner 만). 1회용, 72시간 유효.
create or replace function public.create_invite(p_household_id uuid)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  new_code text;
  exp timestamptz := now() + interval '72 hours';
begin
  if not public.is_owner(p_household_id) then
    raise exception 'only the owner can invite' using errcode = '42501';
  end if;
  -- 헷갈리는 글자(0/O, 1/I/L)를 뺀 10자리 코드. 31^10 가지라 추측할 수 없다.
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (get_byte(b, i) % 31) + 1, 1), '')
    into new_code
  from (select extensions.gen_random_bytes(10) as b) r, generate_series(0, 9) as i;

  insert into public.invites (household_id, code, created_by, expires_at)
  values (p_household_id, new_code, uid, exp);

  return query select new_code, exp;
end;
$$;

-- 초대 코드 미리보기: 합류하기 전에 어느 가족인지 보여 준다.
create or replace function public.preview_invite(p_code text)
returns table (household_name text, valid boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select h.name, (i.used_at is null and i.expires_at > now() and h.deleted_at is null)
  from public.invites i
  join public.households h on h.id = i.household_id
  where i.code = upper(btrim(p_code));
$$;

-- 초대 코드로 합류.
create or replace function public.accept_invite(p_code text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  inv public.invites%rowtype;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into inv from public.invites i
  where i.code = upper(btrim(p_code))
  for update;

  if not found or inv.used_at is not null or inv.expires_at <= now() then
    raise exception 'invalid or expired invite' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.members m
    where m.household_id = inv.household_id and m.user_id = uid and m.deleted_at is null
  ) then
    return inv.household_id;  -- 이미 구성원이면 코드를 쓰지 않고 그대로 둔다
  end if;

  insert into public.members (household_id, user_id, display_name, role)
  values (inv.household_id, uid, btrim(p_display_name), 'member')
  on conflict (household_id, user_id)
  do update set deleted_at = null, display_name = excluded.display_name, role = 'member';

  update public.invites set used_by = uid, used_at = now() where id = inv.id;

  return inv.household_id;
end;
$$;

-- 초대 취소 (owner 만).
create or replace function public.revoke_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.invites i set expires_at = now()
  where i.id = p_invite_id and i.used_at is null and public.is_owner(i.household_id);
  if not found then
    raise exception 'invite not found' using errcode = '42501';
  end if;
end;
$$;

-- 구성원 내보내기 (owner 만, 본인은 제외). 내역은 그대로 남는다.
create or replace function public.remove_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.members%rowtype;
begin
  select * into target from public.members m where m.id = p_member_id and m.deleted_at is null;
  if not found or not public.is_owner(target.household_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if target.user_id = (select auth.uid()) then
    raise exception 'the owner cannot remove themselves' using errcode = '22023';
  end if;
  update public.members set deleted_at = now() where id = p_member_id;
end;
$$;

-- 함수 실행 권한: 기본 권한을 모두 걷어 내고 필요한 것만 로그인 사용자에게 준다.
revoke all on all functions in schema public from anon, authenticated, public;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.is_owner(uuid) to authenticated;
grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.create_invite(uuid) to authenticated;
grant execute on function public.preview_invite(text) to authenticated;
grant execute on function public.accept_invite(text, text) to authenticated;
grant execute on function public.revoke_invite(uuid) to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: 가족 화면 간 즉시 반영
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['households', 'members', 'payment_methods', 'categories', 'tags', 'transfer_rules', 'transactions']
    loop
      execute format('alter publication supabase_realtime add table public.%I', t);
    end loop;
  end if;
end;
$$;
