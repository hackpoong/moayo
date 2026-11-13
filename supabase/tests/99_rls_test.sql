-- RLS / 권한 검증. 실패하면 예외가 나서 psql 이 0 이 아닌 값으로 끝난다.
\set ON_ERROR_STOP on

create schema test;
grant usage on schema test to anon, authenticated;

create function test.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

-- 주어진 SQL 이 오류를 내면 true
create function test.throws(q text) returns boolean language plpgsql as $$
begin
  execute q;
  return false;
exception when others then
  return true;
end $$;

-- 주어진 SQL 이 건드린 행 수
create function test.affected(q text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute q;
  get diagnostics n = row_count;
  return n;
end $$;

create function test.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
end $$;
grant execute on all functions in schema test to anon, authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com');

\set alice '00000000-0000-0000-0000-00000000000a'
\set bob   '00000000-0000-0000-0000-00000000000b'
\set carol '00000000-0000-0000-0000-00000000000c'

-- ── 로그인하지 않은 사용자(anon)는 아무것도 못 한다 ─────────────────────────
set role anon;
select test.login(null);
select test.ok(test.throws('select * from public.transactions'), 'anon: transactions 읽기 불가');
select test.ok(test.throws('select * from public.households'), 'anon: households 읽기 불가');
select test.ok(test.throws($$select public.create_household('x','y')$$), 'anon: create_household 실행 불가');
select test.ok(test.throws($$select * from public.preview_invite('ABC')$$), 'anon: preview_invite 실행 불가');
reset role;

-- ── 앨리스가 A가족을, 캐럴이 C가족을 만든다 ────────────────────────────────
set role authenticated;
select test.login(:'alice');
select public.create_household('A가족', '앨리스') as ha \gset
select test.ok((select count(*) from public.households) = 1, '앨리스: 자기 가족 1개만 보임');
select test.ok((select role from public.members where household_id = :'ha') = 'owner', '만든 사람은 owner');
select test.ok((select count(*) from public.payment_methods where household_id = :'ha') = 3, '기본 결제수단 3개');
select test.ok((select count(*) from public.categories where household_id = :'ha') = 19, '기본 카테고리 19개');

select test.login(:'carol');
select public.create_household('C가족', '캐럴') as hc \gset
select test.ok((select count(*) from public.households) = 1, '캐럴: 자기 가족 1개만 보임');
select test.ok((select count(*) from public.categories) = 19, '캐럴: 자기 가족 카테고리만 보임');

-- ── 앨리스가 내역을 넣는다 ─────────────────────────────────────────────────
select test.login(:'alice');
insert into public.transactions (id, household_id, kind, amount, occurred_at, cash_date, merchant)
values ('11111111-1111-1111-1111-111111111111', :'ha', 'expense', 100000, now(), current_date, '마트');
select test.ok((select count(*) from public.transactions) = 1, '앨리스: 자기 내역 보임');

-- 분할 합계 검증
select test.ok(test.throws(format(
  $$update public.transactions set splits = '[{"category_id":null,"amount":40000}]' where id = '11111111-1111-1111-1111-111111111111'$$)),
  '분할 합계가 금액과 다르면 거부');
update public.transactions
  set splits = '[{"category_id":null,"amount":50000},{"category_id":null,"amount":50000}]'
  where id = '11111111-1111-1111-1111-111111111111';
select test.ok((select jsonb_array_length(splits) from public.transactions) = 2, '분할 합계가 맞으면 저장');

-- ── 캐럴(다른 가족)은 A가족 데이터를 볼 수도, 쓸 수도 없다 ─────────────────
select test.login(:'carol');
select test.ok((select count(*) from public.transactions) = 0, '캐럴: A가족 내역 안 보임');
select test.ok((select count(*) from public.members where household_id = :'ha') = 0, '캐럴: A가족 구성원 안 보임');
select test.ok(test.throws(format(
  $$insert into public.transactions (household_id, kind, amount, occurred_at, cash_date) values (%L, 'expense', 1, now(), current_date)$$, :'ha')),
  '캐럴: A가족에 내역 추가 불가');
select test.ok(test.affected(
  $$update public.transactions set amount = 1 where id = '11111111-1111-1111-1111-111111111111'$$) = 0,
  '캐럴: A가족 내역 수정 불가');
select test.ok(test.throws($$delete from public.transactions$$), '실제 DELETE 권한 없음');
select test.ok(test.throws(format($$select * from public.create_invite(%L)$$, :'ha')), '캐럴: A가족 초대 생성 불가');
select test.ok(test.affected(format($$update public.households set name = 'hack' where id = %L$$, :'ha')) = 0,
  '캐럴: A가족 이름 변경 불가');

-- 자기 가족 내역을 다른 가족으로 옮기는 것도 막힌다
insert into public.transactions (id, household_id, kind, amount, occurred_at, cash_date)
values ('33333333-3333-3333-3333-333333333333', :'hc', 'expense', 5000, now(), current_date);
select test.ok(test.throws(format(
  $$update public.transactions set household_id = %L where id = '33333333-3333-3333-3333-333333333333'$$, :'ha')),
  '내역의 household_id 변경 불가');

-- ── 초대: 앨리스가 만들고 밥이 합류한다 ────────────────────────────────────
select test.login(:'alice');
select code as invite_code from public.create_invite(:'ha') \gset
select test.ok(char_length(:'invite_code') = 10, '초대 코드 10자리');

select test.login(:'bob');
select test.ok((select count(*) from public.transactions) = 0, '밥: 합류 전에는 내역 안 보임');
select test.ok((select count(*) from public.invites) = 0, '밥: 초대 목록 안 보임');
select test.ok((select valid from public.preview_invite(lower(:'invite_code'))), '초대 미리보기: 유효(소문자 입력도 허용)');
select test.ok((select household_name from public.preview_invite(:'invite_code')) = 'A가족', '초대 미리보기: 가족 이름');
select test.ok(test.throws($$select public.accept_invite('ZZZZZZZZZZ', '밥')$$), '틀린 코드는 거부');
select test.ok(public.accept_invite(:'invite_code', '밥') = :'ha', '밥: 초대 코드로 합류');
select test.ok((select count(*) from public.transactions) = 1, '밥: 합류 후 내역 보임');
select test.ok((select role from public.members where user_id = :'bob') = 'member', '밥: member 역할');
select test.ok(test.throws(format($$select * from public.create_invite(%L)$$, :'ha')), '밥(member): 초대 생성 불가');
select test.ok(test.throws($$update public.members set role = 'owner' where user_id = auth.uid()$$), '밥: 자기 역할 올리기 불가');
select test.ok(test.affected(format($$update public.households set name = '밥네' where id = %L$$, :'ha')) = 0,
  '밥(member): 가족 이름 변경 불가');
update public.members set display_name = '밥이' where user_id = auth.uid();
select test.ok((select display_name from public.members where user_id = :'bob') = '밥이', '밥: 자기 표시 이름 변경 가능');
select test.ok(test.affected(format(
  $$update public.members set display_name = 'x' where user_id = %L$$, :'alice')) = 0, '밥: 남의 표시 이름 변경 불가');

-- 밥이 넣은 내역이 앨리스에게 보인다
insert into public.transactions (id, household_id, kind, amount, occurred_at, cash_date)
values ('22222222-2222-2222-2222-222222222222', :'ha', 'income', 3000000, now(), current_date);
select test.login(:'alice');
select test.ok((select count(*) from public.transactions) = 2, '앨리스: 밥이 넣은 내역 보임');

-- 초대 코드는 1회용
select test.login(:'carol');
select test.ok(test.throws(format($$select public.accept_invite(%L, '캐럴')$$, :'invite_code')), '이미 쓴 초대 코드는 거부');
select test.ok(not (select valid from public.preview_invite(:'invite_code')), '쓴 코드는 미리보기에서 무효');

-- ── 구성원 내보내기 ────────────────────────────────────────────────────────
select test.login(:'bob');
select id as alice_member from public.members where user_id = :'alice' \gset
select id as bob_member from public.members where user_id = :'bob' \gset
select test.ok(test.throws(format($$select public.remove_member(%L)$$, :'alice_member')), '밥(member): 내보내기 불가');
select test.login(:'alice');
select test.ok(test.throws(format($$select public.remove_member(%L)$$, :'alice_member')), 'owner 는 자기 자신을 내보낼 수 없음');
select public.remove_member(:'bob_member');
select test.login(:'bob');
select test.ok((select count(*) from public.transactions) = 0, '밥: 내보내진 뒤에는 내역 안 보임');
select test.ok((select count(*) from public.households) = 0, '밥: 내보내진 뒤에는 가족 안 보임');

-- ── updated_at 은 서버가 매긴다 ────────────────────────────────────────────
select test.login(:'alice');
update public.transactions set memo = 'x', updated_at = '2000-01-01' where id = '11111111-1111-1111-1111-111111111111';
select test.ok((select updated_at > now() - interval '1 minute' from public.transactions
  where id = '11111111-1111-1111-1111-111111111111'), 'updated_at 은 클라이언트 값이 아니라 서버 시각');

-- ── created_by 는 서버가 정한다 ─────────────────────────────────────────────
insert into public.transactions (id, household_id, kind, amount, occurred_at, cash_date, created_by)
values ('44444444-4444-4444-4444-444444444444', :'ha', 'expense', 1000, now(), current_date, :'carol');
select test.ok((select created_by from public.transactions where id = '44444444-4444-4444-4444-444444444444') = :'alice',
  'created_by 를 남의 id 로 보내도 로그인한 사용자로 저장');
update public.transactions set created_by = :'carol' where id = '44444444-4444-4444-4444-444444444444';
select test.ok((select created_by from public.transactions where id = '44444444-4444-4444-4444-444444444444') = :'alice',
  'created_by 는 수정할 수 없음');

-- upsert(같은 id 로 다시 보내기)는 수정으로 처리된다(오프라인 재전송 대비)
insert into public.transactions (id, household_id, kind, amount, occurred_at, cash_date)
values ('44444444-4444-4444-4444-444444444444', :'ha', 'expense', 2000, now(), current_date)
on conflict (id) do update set amount = excluded.amount;
select test.ok((select amount from public.transactions where id = '44444444-4444-4444-4444-444444444444') = 2000,
  '같은 id 로 다시 보내면 덮어쓰기');

-- 다른 가족 행의 id 로 upsert 해도 그 행을 바꿀 수 없다
select test.login(:'carol');
select test.ok(test.throws(format($$insert into public.transactions (id, household_id, kind, amount, occurred_at, cash_date)
  values ('44444444-4444-4444-4444-444444444444', %L, 'expense', 1, now(), current_date)
  on conflict (id) do update set amount = excluded.amount$$, :'hc')), '다른 가족 행 id 로 upsert 불가');
select test.login(:'alice');
select test.ok((select amount from public.transactions where id = '44444444-4444-4444-4444-444444444444') = 2000,
  '다른 가족의 upsert 시도 뒤에도 값 그대로');

reset role;
\echo 'ALL DB TESTS PASSED'
