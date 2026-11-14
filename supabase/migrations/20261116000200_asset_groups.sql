-- 자산 그룹을 편한가계부 목록에 맞춰 늘리고, 아이콘·결제 계좌·메모를 더한다.
alter table public.payment_methods drop constraint if exists payment_methods_type_check;
alter table public.payment_methods add constraint payment_methods_type_check check (type in (
  'cash', 'bank_account', 'credit_card', 'check_card', 'prepaid_card', 'local_currency', 'easy_pay',
  'gift_voucher', 'savings', 'investment', 'overdraft', 'loan', 'insurance', 'other'));

alter table public.payment_methods
  add column if not exists icon text check (icon is null or char_length(icon) <= 16),
  add column if not exists linked_account_id uuid references public.payment_methods (id) on delete set null,
  add column if not exists memo text check (memo is null or char_length(memo) <= 500);
