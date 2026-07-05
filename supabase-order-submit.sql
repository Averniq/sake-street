-- Atomic public order submission for QR customers.
-- Run this file once in the Supabase SQL Editor.

update public.restaurants
set tax_rate = 10
where slug = 'sake-street';

create or replace function public.submit_order(
  p_restaurant_id uuid,
  p_table_id uuid,
  p_local_id text,
  p_note text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order_id uuid;
  target_order_number bigint;
  target_tax_rate numeric(5,2);
  calculated_subtotal numeric(10,2);
  calculated_tax numeric(10,2);
  calculated_total numeric(10,2);
begin
  if p_local_id is null or length(trim(p_local_id)) < 3 then
    raise exception 'INVALID_ORDER_ID';
  end if;

  if coalesce(jsonb_typeof(p_items), '') <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then
    raise exception 'INVALID_ORDER_ITEMS';
  end if;

  select r.tax_rate into target_tax_rate
  from public.restaurants r
  join public.restaurant_tables t on t.restaurant_id = r.id
  where r.id = p_restaurant_id
    and r.is_active
    and r.is_open
    and t.id = p_table_id
    and t.is_active
  limit 1;

  if target_tax_rate is null then
    raise exception 'INVALID_OR_CLOSED_TABLE';
  end if;

  select o.id, o.order_number
  into target_order_id, target_order_number
  from public.orders o
  where o.local_id = p_local_id
  limit 1;

  if target_order_id is not null then
    return jsonb_build_object('id', target_order_id, 'order_number', target_order_number);
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    where coalesce((item ->> 'quantity')::integer, 0) not between 1 and 99
      or coalesce((item ->> 'unit_price')::numeric, -1) < 0
      or length(trim(coalesce(item ->> 'name', ''))) < 1
  ) then
    raise exception 'INVALID_ORDER_ITEM';
  end if;

  select round(coalesce(sum(
    (item ->> 'unit_price')::numeric * (item ->> 'quantity')::integer
  ), 0), 2)
  into calculated_total
  from jsonb_array_elements(p_items) item;

  calculated_tax := round(calculated_total * target_tax_rate / (100 + target_tax_rate), 2);
  calculated_subtotal := calculated_total - calculated_tax;

  insert into public.orders (
    local_id, restaurant_id, table_id, status, note, subtotal, tax, total
  ) values (
    p_local_id,
    p_restaurant_id,
    p_table_id,
    'New',
    left(coalesce(p_note, ''), 1000),
    calculated_subtotal,
    calculated_tax,
    calculated_total
  )
  returning id, order_number into target_order_id, target_order_number;

  insert into public.order_items (
    order_id, menu_item_id, name_snapshot, base_price, unit_price, quantity, options
  )
  select
    target_order_id,
    nullif(item ->> 'menu_item_id', '')::uuid,
    left(item ->> 'name', 200),
    coalesce((item ->> 'base_price')::numeric, (item ->> 'unit_price')::numeric),
    (item ->> 'unit_price')::numeric,
    (item ->> 'quantity')::integer,
    coalesce(item -> 'options', '[]'::jsonb)
  from jsonb_array_elements(p_items) item;

  return jsonb_build_object('id', target_order_id, 'order_number', target_order_number);
end;
$$;

revoke all on function public.submit_order(uuid, uuid, text, text, jsonb) from public;
grant execute on function public.submit_order(uuid, uuid, text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';

select 'Atomic order submission is ready.' as result;
