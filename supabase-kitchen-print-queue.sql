-- Reliable kitchen print queue for a local LAN receipt-printer bridge.
-- Run this file once in the Supabase SQL Editor.

alter table public.orders
  add column if not exists kitchen_printed_at timestamptz,
  add column if not exists kitchen_print_claimed_at timestamptz,
  add column if not exists kitchen_print_attempts integer not null default 0,
  add column if not exists kitchen_print_error text;

create index if not exists orders_kitchen_print_queue_idx
on public.orders (restaurant_id, created_at)
where kitchen_printed_at is null and status <> 'Cancelled';

create or replace function public.claim_kitchen_print_job(p_restaurant_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order public.orders%rowtype;
  target_table_name text;
  target_restaurant_name text;
begin
  select o.*
  into target_order
  from public.orders o
  join public.restaurant_tables t on t.id = o.table_id
  join public.restaurants r on r.id = o.restaurant_id
  where r.slug = p_restaurant_slug
    and public.is_restaurant_staff(o.restaurant_id)
    and o.status <> 'Cancelled'
    and o.kitchen_printed_at is null
    and o.kitchen_print_attempts < 10
    and (
      o.kitchen_print_claimed_at is null
      or o.kitchen_print_claimed_at < now() - interval '2 minutes'
    )
  order by o.created_at
  for update of o skip locked
  limit 1;

  if target_order.id is null then
    return null;
  end if;

  select t.name, r.name
  into target_table_name, target_restaurant_name
  from public.restaurant_tables t
  join public.restaurants r on r.id = target_order.restaurant_id
  where t.id = target_order.table_id;

  update public.orders
  set kitchen_print_claimed_at = now(),
      kitchen_print_attempts = kitchen_print_attempts + 1,
      kitchen_print_error = null
  where id = target_order.id;

  return jsonb_build_object(
    'id', target_order.id,
    'order_number', target_order.order_number,
    'restaurant_name', target_restaurant_name,
    'table_name', target_table_name,
    'note', target_order.note,
    'created_at', target_order.created_at,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', oi.name_snapshot,
          'quantity', oi.quantity,
          'options', oi.options
        ) order by oi.created_at
      )
      from public.order_items oi
      where oi.order_id = target_order.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.finish_kitchen_print_job(
  p_order_id uuid,
  p_success boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_restaurant_id uuid;
begin
  select restaurant_id into target_restaurant_id
  from public.orders
  where id = p_order_id;

  if target_restaurant_id is null
    or not public.is_restaurant_staff(target_restaurant_id) then
    raise exception 'PRINT_JOB_NOT_ALLOWED';
  end if;

  if p_success then
    update public.orders
    set kitchen_printed_at = now(),
        kitchen_print_claimed_at = null,
        kitchen_print_error = null
    where id = p_order_id;
  else
    update public.orders
    set kitchen_print_claimed_at = now(),
        kitchen_print_error = left(coalesce(p_error, 'Unknown printer error'), 1000)
    where id = p_order_id;
  end if;
end;
$$;

create or replace function public.reprint_kitchen_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_restaurant_id uuid;
begin
  select restaurant_id into target_restaurant_id
  from public.orders
  where id = p_order_id;

  if target_restaurant_id is null
    or not public.is_restaurant_staff(target_restaurant_id) then
    raise exception 'REPRINT_NOT_ALLOWED';
  end if;

  update public.orders
  set kitchen_printed_at = null,
      kitchen_print_claimed_at = null,
      kitchen_print_attempts = 0,
      kitchen_print_error = 'Manual reprint requested'
  where id = p_order_id;
end;
$$;

revoke all on function public.claim_kitchen_print_job(text) from public;
revoke all on function public.finish_kitchen_print_job(uuid, boolean, text) from public;
revoke all on function public.reprint_kitchen_order(uuid) from public;
grant execute on function public.claim_kitchen_print_job(text) to authenticated;
grant execute on function public.finish_kitchen_print_job(uuid, boolean, text) to authenticated;
grant execute on function public.reprint_kitchen_order(uuid) to authenticated;

notify pgrst, 'reload schema';

select 'Kitchen print queue is ready.' as result;
