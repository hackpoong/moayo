-- 이미지 지문. 거의 같은 사진을 다시 올리면 AI 를 다시 부르지 않고 예전 결과를 쓴다.
alter table public.raw_inputs add column if not exists image_phash text check (image_phash is null or image_phash ~ '^[0-9a-f]{64}$');
create index if not exists raw_inputs_phash_idx on public.raw_inputs (household_id, created_at desc) where image_phash is not null;
