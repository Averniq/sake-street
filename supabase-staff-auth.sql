-- Sake Street employee authentication setup
-- 1. In Supabase Dashboard, open Authentication > Users > Add user.
-- 2. Create staff@sakestreet.com.au with a strong password and Auto Confirm enabled.
-- 3. Run this file in SQL Editor. Staff will log in with username: Staff.

do $$
declare
  employee_email text := 'staff@sakestreet.com.au';
  employee_role text := 'owner';
  target_user_id uuid;
  target_restaurant_id uuid;
begin
  if employee_role not in ('owner', 'manager', 'kitchen', 'staff') then
    raise exception 'Role must be owner, manager, kitchen, or staff.';
  end if;

  select id into target_user_id
  from auth.users
  where lower(email) = lower(employee_email)
  limit 1;

  if target_user_id is null then
    raise exception 'No Supabase Auth user found for %', employee_email;
  end if;

  select id into target_restaurant_id
  from public.restaurants
  where slug = 'sake-street'
  limit 1;

  if target_restaurant_id is null then
    raise exception 'Sake Street restaurant record was not found.';
  end if;

  insert into public.restaurant_users (restaurant_id, user_id, role)
  values (target_restaurant_id, target_user_id, employee_role)
  on conflict (restaurant_id, user_id)
  do update set role = excluded.role;
end
$$;

create or replace function public.has_restaurant_role(target_restaurant uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.restaurant_users
    where restaurant_id = target_restaurant
      and user_id = auth.uid()
      and role = any(allowed_roles)
  );
$$;

revoke all on function public.has_restaurant_role(uuid, text[]) from public;
grant execute on function public.has_restaurant_role(uuid, text[]) to authenticated;

create or replace function public.bootstrap_menu(
  p_restaurant_slug text,
  p_items jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target_restaurant_id uuid;
  inserted_count integer;
begin
  select id into target_restaurant_id
  from public.restaurants
  where slug = p_restaurant_slug and is_active
  limit 1;

  if target_restaurant_id is null then
    raise exception 'RESTAURANT_NOT_FOUND';
  end if;

  if not public.has_restaurant_role(target_restaurant_id, array['owner', 'manager']) then
    raise exception 'STAFF_ACCESS_REQUIRED';
  end if;

  if exists (
    select 1 from public.menu_items
    where restaurant_id = target_restaurant_id
  ) then
    raise exception 'MENU_ALREADY_INITIALIZED';
  end if;

  insert into public.menu_items (
    restaurant_id, local_id, category, name, description, price, tags,
    photo_url, option_template, sold_out, sort_order
  )
  select
    target_restaurant_id,
    item ->> 'id',
    item ->> 'category',
    item ->> 'name',
    coalesce(item ->> 'description', ''),
    (item ->> 'price')::numeric,
    coalesce(item -> 'tags', '[]'::jsonb),
    '',
    coalesce(item ->> 'optionTemplate', 'none'),
    coalesce((item ->> 'soldOut')::boolean, false),
    ordinality::integer
  from jsonb_array_elements(p_items) with ordinality as source(item, ordinality);

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.bootstrap_menu(text, jsonb) from public;
revoke execute on function public.bootstrap_menu(text, jsonb) from anon;
grant execute on function public.bootstrap_menu(text, jsonb) to authenticated;

drop policy if exists "staff manage restaurant" on public.restaurants;
create policy "staff manage restaurant" on public.restaurants
for update to authenticated
using (public.has_restaurant_role(id, array['owner', 'manager']))
with check (public.has_restaurant_role(id, array['owner', 'manager']));

drop policy if exists "staff manage tables" on public.restaurant_tables;
create policy "staff manage tables" on public.restaurant_tables
for all to authenticated
using (public.has_restaurant_role(restaurant_id, array['owner', 'manager']))
with check (public.has_restaurant_role(restaurant_id, array['owner', 'manager']));

drop policy if exists "staff manage menu" on public.menu_items;
create policy "staff manage menu" on public.menu_items
for all to authenticated
using (public.has_restaurant_role(restaurant_id, array['owner', 'manager']))
with check (public.has_restaurant_role(restaurant_id, array['owner', 'manager']));

select
  r.name as restaurant,
  u.email,
  ru.role
from public.restaurant_users ru
join public.restaurants r on r.id = ru.restaurant_id
join auth.users u on u.id = ru.user_id
where r.slug = 'sake-street'
order by ru.created_at;
