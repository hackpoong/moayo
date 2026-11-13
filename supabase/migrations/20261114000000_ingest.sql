-- P2: 자동 입력 파이프라인
--  * raw_inputs: 들어온 원문(이미지 경로·문자 원문)과 AI 가 뽑아낸 결과를 그대로 보존한다.
--  * transaction_sources: 내역 ↔ 원문 연결(내역 하나에 출처 여럿, 원문 하나에 내역 여럿).
--  * 쓰기는 서버 함수(ingest)만 한다. 가족 구성원은 읽기만.

alter table public.transactions
  add column if not exists payment_label text check (payment_label is null or char_length(payment_label) <= 80),
  add column if not exists review jsonb;

create table public.raw_inputs (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  member_id     uuid,
  source        text not null check (source in ('image', 'screenshot', 'statement', 'sms', 'push', 'share', 'text')),
  raw_text      text check (raw_text is null or char_length(raw_text) <= 20000),
  image_path    text,
  app_package   text,
  device_id     text,
  received_at   timestamptz not null default now(),
  content_hash  text not null,
  status        text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  parser        text,
  model         text,
  extraction    jsonb,
  result        jsonb,
  error         text,
  usage         jsonb,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (household_id, content_hash)
);
create index raw_inputs_household_idx on public.raw_inputs (household_id, created_at desc);

create table public.transaction_sources (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households (id) on delete cascade,
  transaction_id   uuid not null,
  raw_input_id     uuid not null references public.raw_inputs (id) on delete cascade,
  candidate_index  integer not null,
  action           text not null check (action in ('created', 'merged', 'duplicate', 'review')),
  filled_fields    text[] not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index transaction_sources_tx_idx on public.transaction_sources (household_id, transaction_id);
create index transaction_sources_raw_idx on public.transaction_sources (raw_input_id);

create trigger raw_inputs_touch before insert or update on public.raw_inputs
  for each row execute function public.touch_updated_at();
create trigger transaction_sources_touch before insert or update on public.transaction_sources
  for each row execute function public.touch_updated_at();

alter table public.raw_inputs enable row level security;
alter table public.transaction_sources enable row level security;
revoke all on public.raw_inputs, public.transaction_sources from anon, authenticated, public;
grant select on public.raw_inputs, public.transaction_sources to authenticated;

create policy raw_inputs_select on public.raw_inputs
  for select to authenticated using (public.is_member(household_id));
create policy transaction_sources_select on public.transaction_sources
  for select to authenticated using (public.is_member(household_id));

-- 서버 함수는 service_role 로 쓴다(RLS 를 건너뜀). 로컬 테스트 DB 에는 이 역할이 없을 수 있다.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update on public.raw_inputs, public.transaction_sources to service_role;
  end if;
end;
$$;

-- 이미지 저장소: 비공개 버킷. 경로 첫 폴더가 가족 id 이고, 그 가족 구성원만 올리고 읽는다.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('inputs', 'inputs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
    on conflict (id) do nothing;

    execute $p$
      create policy inputs_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'inputs' and public.is_member(((storage.foldername(name))[1])::uuid))
    $p$;
    execute $p$
      create policy inputs_select on storage.objects for select to authenticated
      using (bucket_id = 'inputs' and public.is_member(((storage.foldername(name))[1])::uuid))
    $p$;
  end if;
end;
$$;
