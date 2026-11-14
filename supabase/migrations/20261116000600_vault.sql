-- 카드 정보 금고. 카드번호·유효기간·CVC 는 휴대폰에서 가족 금고 비밀번호로 암호화한 값만 저장한다.
-- 서버·Supabase·AI 누구도 비밀번호 없이 읽을 수 없다.

-- 자산의 암호문: {"v":1,"iv":"…","ct":"…"} (AES-GCM, base64)
alter table public.payment_methods add column if not exists secret jsonb;
alter table public.payment_methods drop constraint if exists payment_methods_secret_check;
alter table public.payment_methods add constraint payment_methods_secret_check
  check (secret is null or (jsonb_typeof(secret) = 'object' and secret ? 'iv' and secret ? 'ct' and length(secret::text) < 4000));

-- 가족 금고: 키를 만들 소금과, 비밀번호가 맞는지 확인할 암호문만 둔다.
create table if not exists public.household_vault (
  household_id  uuid primary key references public.households (id) on delete cascade,
  salt          text not null check (length(salt) between 16 and 64),
  iterations    integer not null check (iterations between 100000 and 5000000),
  verifier      jsonb not null check (jsonb_typeof(verifier) = 'object' and verifier ? 'iv' and verifier ? 'ct'),
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger household_vault_touch before insert or update on public.household_vault
  for each row execute function public.touch_updated_at();
create trigger household_vault_created_by before insert or update on public.household_vault
  for each row execute function public.stamp_created_by();

alter table public.household_vault enable row level security;
grant select, insert, update on public.household_vault to authenticated;
create policy household_vault_select on public.household_vault for select to authenticated using (public.is_member(household_id));
create policy household_vault_insert on public.household_vault for insert to authenticated with check (public.is_member(household_id));
create policy household_vault_update on public.household_vault for update to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
