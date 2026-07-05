-- Safe customer order-status lookup for QR table ordering.
-- Run this file once in the Supabase SQL Editor.

create or replace function public.get_customer_order_status(
  p_order_id uuid,
  p_local_id text,
  p_table_token text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id,
    'local_id', o.local_id,
    'order_number', o.order_number,
    'status', o.status,
    'total', o.total,
    'created_at', o.created_at,
    'served_at', o.served_at,
    'closed_at', o.closed_at,
    'updated_at', o.updated_at,
    'table_name', t.name
  )
  from public.orders o
  join public.restaurant_tables t on t.id = o.table_id
  where o.id = p_order_id
    and o.local_id = p_local_id
    and t.table_token = p_table_token
    and t.is_active
    and o.created_at > now() - interval '24 hours'
  limit 1;
$$;

revoke all on function public.get_customer_order_status(uuid, text, text) from public;
grant execute on function public.get_customer_order_status(uuid, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

select 'Customer order status tracking is ready.' as result;
