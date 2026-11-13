-- 로컬 Postgres 에서 마이그레이션을 검증하기 위한 Supabase 흉내(역할, auth 스키마).
-- 실제 Supabase 에는 적용하지 않는다.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end;
$$;

create schema if not exists extensions;
create schema if not exists auth;
grant usage on schema public, extensions, auth to anon, authenticated;

create table auth.users (id uuid primary key, email text);

create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated;

-- Supabase 는 public 스키마에 새로 생기는 객체를 anon/authenticated 에게 기본으로 열어 준다.
-- 마이그레이션이 그 기본값을 제대로 걷어 내는지 보려고 똑같이 흉내 낸다.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
