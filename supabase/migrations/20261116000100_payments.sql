-- 여러 자산으로 나눠 낸 결제: 자산별 금액. 비어 있으면 payment_method_id 한 곳에서 전액.
alter table public.transactions
  add column if not exists payments jsonb not null default '[]'
    check (jsonb_typeof(payments) = 'array' and jsonb_array_length(payments) <= 10);

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
  if jsonb_array_length(new.payments) > 0 then
    select coalesce(sum((p ->> 'amount')::bigint), 0) into total
    from jsonb_array_elements(new.payments) as p;
    if total <> new.amount then
      raise exception 'payments total (%) must equal amount (%)', total, new.amount using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_check_splits on public.transactions;
create trigger transactions_check_splits
  before insert or update of splits, payments, amount on public.transactions
  for each row execute function public.check_transaction_splits();
