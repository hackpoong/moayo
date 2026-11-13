-- P1 보완
--  * 입력한 사람(created_by)은 클라이언트가 보낸 값이 아니라 로그인한 사용자로 서버가 정한다.
--  * 초대 목록 조회용 인덱스.

create or replace function public.stamp_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger transactions_stamp_created_by
  before insert or update on public.transactions
  for each row execute function public.stamp_created_by();

revoke all on function public.stamp_created_by() from anon, authenticated, public;

create index if not exists invites_household_idx on public.invites (household_id);
