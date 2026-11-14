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
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'dana@example.com');

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
  $$update public.members set emoji = '💙' where user_id = %L$$, :'alice')) = 1, '밥: 같은 가족 구성원 표시(이모지) 변경 가능');
select test.ok(test.throws(format($$update public.members set role = 'member' where user_id = %L$$, :'alice')), '밥: 남의 역할 변경 불가');

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

-- ── 원문 보관함: 구성원은 읽기만, 쓰기는 서버 함수만 ─────────────────────────
reset role;
insert into public.raw_inputs (id, household_id, source, raw_text, content_hash)
values ('55555555-5555-5555-5555-555555555555', :'ha', 'sms', '현대카드 승인 12,500원', 'h1');
set role authenticated;
select test.login(:'alice');
select test.ok((select count(*) from public.raw_inputs) = 1, '앨리스: 자기 가족 원문 보임');
select test.ok(test.throws(format($$insert into public.raw_inputs (household_id, source, content_hash) values (%L, 'sms', 'x')$$, :'ha')),
  '구성원도 원문을 직접 넣을 수 없음(서버 함수만)');
select test.ok(test.throws($$update public.raw_inputs set raw_text = 'x'$$), '원문 수정 불가');
select test.login(:'carol');
select test.ok((select count(*) from public.raw_inputs) = 0, '캐럴: 다른 가족 원문 안 보임');
select test.login(:'alice');

-- ── 계정 없는 구성원(은주 자리) → 그 자리 초대로 연결 ──────────────────────
select test.login(:'alice');
select public.create_placeholder_member(:'ha', '은주', '💛', '#eab308') as ph \gset
select test.ok((select user_id is null from public.members where id = :'ph'), '계정 없는 구성원 생성');
update public.members set aliases = array['가나다'] where id = :'ph';
select test.ok((select aliases[1] from public.members where id = :'ph') = '가나다', '계정 없는 구성원의 이체 이름 저장');
insert into public.payment_methods (household_id, name, type, owner_member_id) values (:'ha', '은주 카드', 'credit_card', :'ph');
select test.login(:'carol');
select test.ok(test.throws(format($$select public.create_placeholder_member(%L, 'x')$$, :'ha')), '캐럴: 다른 가족에 구성원 추가 불가');
select test.ok(test.throws(format($$select * from public.create_member_invite(%L, %L)$$, :'ha', :'ph')), '캐럴: 다른 가족 자리 초대 불가');
select test.login(:'alice');
select code as seat_code from public.create_member_invite(:'ha', :'ph') \gset
select test.login('00000000-0000-0000-0000-00000000000d');
select test.ok((select member_name from public.preview_invite(:'seat_code')) = '은주', '자리 초대 미리보기: 들어갈 이름');
select test.ok(public.accept_invite(:'seat_code', '아무이름') = :'ha', '데이나: 자리 초대로 합류');
select test.ok((select count(*) from public.members where household_id = :'ha' and display_name = '은주' and user_id = '00000000-0000-0000-0000-00000000000d') = 1,
  '합류하면 새 구성원이 아니라 은주 자리에 계정이 연결됨');
select test.ok((select count(*) from public.payment_methods where owner_member_id = :'ph') = 1, '은주 자리의 자산이 그대로 이어짐');
select test.login(:'alice');
select test.ok(test.throws(format($$select * from public.create_member_invite(%L, %L)$$, :'ha', :'ph')), '이미 연결된 자리는 다시 초대 불가');

-- ── 자산별 금액 합은 전체 금액과 같아야 한다 ────────────────────────────
select test.ok(test.throws(format($$insert into public.transactions (household_id, kind, amount, occurred_at, cash_date, payments)
  values (%L, 'expense', 7000, now(), current_date, '[{"amount":3000},{"amount":3000}]')$$, :'ha')), '자산별 금액 합이 다르면 거부');
select test.ok(test.affected(format($$insert into public.transactions (household_id, kind, amount, occurred_at, cash_date, payments)
  values (%L, 'expense', 7000, now(), current_date, '[{"amount":3000},{"amount":4000}]')$$, :'ha')) = 1, '자산별 금액 합이 맞으면 저장');

-- ── 병합 상태, 바꾸기 규칙 ───────────────────────────────────────────────
select test.ok(test.affected(format($$insert into public.transactions (household_id, kind, amount, occurred_at, cash_date, status)
  values (%L, 'expense', 800, now(), current_date, 'merged')$$, :'ha')) = 1, '합쳐진 내역 상태 저장');
select test.ok(test.affected(format($$insert into public.merchant_rules (household_id, match_key, set_merchant) values (%L, '에브리포터블', '휴대폰충전')$$, :'ha')) = 1,
  '앨리스: 바꾸기 규칙 추가');
select test.ok((select created_by from public.merchant_rules limit 1) = :'alice', '규칙 만든 사람 기록');
select test.login(:'carol');
select test.ok((select count(*) from public.merchant_rules) = 0, '캐럴: 다른 가족 규칙 안 보임');
select test.login(:'alice');

-- ── 기록: 누가 만들고 고쳤는지 ───────────────────────────────────────────
insert into public.transactions (id, household_id, kind, amount, occurred_at, cash_date, merchant)
values ('66666666-6666-6666-6666-666666666666', :'ha', 'expense', 800, now(), current_date, '에브리포터블');
select test.ok((select action from public.activity_log where tx_id = '66666666-6666-6666-6666-666666666666' order by created_at limit 1) = 'create', '기록: 만들기');
select test.ok((select m.display_name from public.activity_log a join public.members m on m.id = a.member_id
  where a.tx_id = '66666666-6666-6666-6666-666666666666' limit 1) = '앨리스', '기록: 만든 사람');
update public.transactions set merchant = '휴대폰충전' where id = '66666666-6666-6666-6666-666666666666';
select test.ok((select summary from public.activity_log where tx_id = '66666666-6666-6666-6666-666666666666' and action = 'update') = '제목 에브리포터블 → 휴대폰충전',
  '기록: 고친 칸 요약');
update public.transactions set merchant = '휴대폰충전' where id = '66666666-6666-6666-6666-666666666666';
select test.ok((select count(*) from public.activity_log where tx_id = '66666666-6666-6666-6666-666666666666') = 2, '기록: 같은 값으로 다시 저장하면 남기지 않음');
select test.ok(test.throws(format($$insert into public.activity_log (household_id, action) values (%L, 'create')$$, :'ha')), '기록은 직접 쓸 수 없음');
select test.ok((select updated_by from public.transactions where id = '66666666-6666-6666-6666-666666666666') = :'alice', '마지막으로 고친 사람');
insert into public.recurring_rules (household_id, template, day_of_month, start_month) values (:'ha', '{"amount": 55000}', 25, '2026-11');
select test.ok((select count(*) from public.recurring_rules) = 1, '정기 지출 규칙 추가');
select test.login(:'carol');
select test.ok((select count(*) from public.activity_log where household_id = :'ha') = 0 and (select count(*) from public.recurring_rules) = 0, '캐럴: 다른 가족 기록·규칙 안 보임');
select test.login(:'alice');

-- ── 사진 ─────────────────────────────────────────────────────────────────
select test.ok(test.affected(format($$insert into public.transactions (household_id, kind, amount, occurred_at, cash_date, attachments)
  values (%L, 'expense', 900, now(), current_date, '[{"id":"a","path":"p"}]')$$, :'ha')) = 1, '사진 붙인 내역 저장');
select test.ok(test.throws(format($$insert into public.transactions (household_id, kind, amount, occurred_at, cash_date, attachments)
  values (%L, 'expense', 900, now(), current_date, (select jsonb_agg(jsonb_build_object('id', g)) from generate_series(1, 9) g))$$, :'ha')), '사진 9장은 거부');

reset role;
\echo 'ALL DB TESTS PASSED'
