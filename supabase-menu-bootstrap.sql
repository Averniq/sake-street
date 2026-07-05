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

  if exists (
    select 1 from public.menu_items
    where restaurant_id = target_restaurant_id
  ) then
    raise exception 'MENU_ALREADY_INITIALIZED';
  end if;

  insert into public.menu_items (
    restaurant_id,
    local_id,
    category,
    name,
    description,
    price,
    tags,
    photo_url,
    option_template,
    sold_out,
    sort_order
  )
  select
    target_restaurant_id,
    item ->> 'id',
    item ->> 'category',
    item ->> 'name',
    coalesce(item ->> 'description', ''),
    (item ->> 'price')::numeric,
    coalesce(item -> 'tags', '[]'::jsonb),
    coalesce(item ->> 'photoUrl', ''),
    coalesce(item ->> 'optionTemplate', 'none'),
    coalesce((item ->> 'soldOut')::boolean, false),
    ordinality::integer
  from jsonb_array_elements(p_items) with ordinality as source(item, ordinality);

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.bootstrap_menu(text, jsonb) from public;
grant execute on function public.bootstrap_menu(text, jsonb) to anon, authenticated;
