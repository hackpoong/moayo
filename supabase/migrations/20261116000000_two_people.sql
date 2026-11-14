-- 두 사람 가계부: 아직 가입하지 않은 사람도 구성원으로 미리 둔다.
--  * members.user_id 를 비울 수 있다(계정 없는 구성원). 나중에 그 사람 몫 초대 코드로 들어오면 그 자리에 연결된다.
--  * members.emoji: 이름 앞에 붙는 표시(💛, 💙 …).
--  * members.aliases: 실명 등 '이 이름으로 보낸 돈은 이체(지출 아님)'로 볼 이름들.
--  * 구성원은 같은 가족의 다른 구성원 표시(이름·이모지·색·이체 이름)도 고칠 수 있다.

alter table public.members alter column user_id drop not null;
alter table public.members
  add column if not exists emoji text check (emoji is null or char_length(emoji) <= 8),
  add column if not exists aliases text[] not null default '{}'
    check (cardinality(aliases) <= 10);

grant update (display_name, color, emoji, aliases) on public.members to authenticated;
drop policy if exists members_update_self on public.members;
create policy members_update on public.members
  for update to authenticated
  using (public.is_member(household_id) and deleted_at is null)
  with check (public.is_member(household_id));

-- 계정 없는 구성원 만들기.
create or replace function public.create_placeholder_member(
  p_household_id uuid, p_display_name text, p_emoji text default null, p_color text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  mid uuid;
begin
  if not public.is_member(p_household_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if (select count(*) from public.members m where m.household_id = p_household_id and m.deleted_at is null) >= 6 then
    raise exception 'too many members' using errcode = '22023';
  end if;
  insert into public.members (household_id, user_id, display_name, role, emoji, color)
  values (p_household_id, null, btrim(p_display_name), 'member', p_emoji, p_color)
  returning id into mid;
  return mid;
end;
$$;

-- 초대 코드가 어느 (계정 없는) 구성원 자리로 들어올지.
alter table public.invites
  add column if not exists member_id uuid references public.members (id) on delete set null;

create or replace function public.create_member_invite(p_household_id uuid, p_member_id uuid)
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
  if not public.is_member(p_household_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.members m
    where m.id = p_member_id and m.household_id = p_household_id and m.user_id is null and m.deleted_at is null
  ) then
    raise exception 'member already linked' using errcode = '22023';
  end if;
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (get_byte(b, i) % 31) + 1, 1), '')
    into new_code
  from (select extensions.gen_random_bytes(10) as b) r, generate_series(0, 9) as i;

  insert into public.invites (household_id, code, created_by, expires_at, member_id)
  values (p_household_id, new_code, uid, exp, p_member_id);

  return query select new_code, exp;
end;
$$;

-- 초대 코드로 합류. 자리가 정해진 초대면 그 구성원에 계정을 연결한다.
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

  if inv.member_id is not null and exists (
    select 1 from public.members m where m.id = inv.member_id and m.user_id is null and m.deleted_at is null
  ) then
    update public.members set user_id = uid where id = inv.member_id;
  else
    insert into public.members (household_id, user_id, display_name, role)
    values (inv.household_id, uid, btrim(p_display_name), 'member')
    on conflict (household_id, user_id)
    do update set deleted_at = null, display_name = excluded.display_name, role = 'member';
  end if;

  update public.invites set used_by = uid, used_at = now() where id = inv.id;

  return inv.household_id;
end;
$$;

-- 초대 미리보기: 어느 자리로 들어가는지도 보여 준다.
drop function if exists public.preview_invite(text);
create or replace function public.preview_invite(p_code text)
returns table (household_name text, valid boolean, member_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select h.name, (i.used_at is null and i.expires_at > now() and h.deleted_at is null),
         case when m.user_id is null then m.display_name end
  from public.invites i
  join public.households h on h.id = i.household_id
  left join public.members m on m.id = i.member_id and m.deleted_at is null
  where i.code = upper(btrim(p_code));
$$;

revoke all on function public.create_placeholder_member(uuid, text, text, text) from anon, authenticated, public;
revoke all on function public.create_member_invite(uuid, uuid) from anon, authenticated, public;
revoke all on function public.preview_invite(text) from anon, authenticated, public;
grant execute on function public.create_placeholder_member(uuid, text, text, text) to authenticated;
grant execute on function public.create_member_invite(uuid, uuid) to authenticated;
grant execute on function public.preview_invite(text) to authenticated;
