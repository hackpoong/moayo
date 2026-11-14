-- '가구·가전' 지출 분류(테이블·소파·가전제품 영수증용). 생활용품 바로 뒤에 둔다. 이미 있으면 그대로.
update public.categories c
set sort = c.sort + 1
where c.kind = 'expense' and c.sort >= 3
  and not exists (select 1 from public.categories x where x.household_id = c.household_id and x.name = '가구·가전');

insert into public.categories (household_id, name, kind, icon, color, sort)
select h.id, '가구·가전', 'expense', '🛋️', '#a855f7', 3
from public.households h
where not exists (select 1 from public.categories x where x.household_id = h.id and x.name = '가구·가전');
