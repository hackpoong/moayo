-- 내역에 붙이는 사진(영수증·직접 첨부). 휴대폰에서 1600px WebP 로 줄이고 400px 썸네일과 함께 올린다.

alter table public.transactions add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.transactions drop constraint if exists transactions_attachments_check;
alter table public.transactions add constraint transactions_attachments_check
  check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 8);

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('attachments', 'attachments', false, 2097152, array['image/webp', 'image/jpeg'])
    on conflict (id) do nothing;

    execute $p$ drop policy if exists attachments_insert on storage.objects $p$;
    execute $p$ drop policy if exists attachments_select on storage.objects $p$;
    execute $p$ drop policy if exists attachments_delete on storage.objects $p$;
    execute $p$
      create policy attachments_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'attachments' and public.is_member(((storage.foldername(name))[1])::uuid))
    $p$;
    execute $p$
      create policy attachments_select on storage.objects for select to authenticated
      using (bucket_id = 'attachments' and public.is_member(((storage.foldername(name))[1])::uuid))
    $p$;
    execute $p$
      create policy attachments_delete on storage.objects for delete to authenticated
      using (bucket_id = 'attachments' and public.is_member(((storage.foldername(name))[1])::uuid))
    $p$;
  end if;
end;
$$;

-- 불러오기 원본은 7일만 둔다(엣지 함수가 정리). 정리할 대상을 빨리 찾는 색인.
create index if not exists raw_inputs_image_cleanup_idx on public.raw_inputs (created_at) where image_path is not null;
