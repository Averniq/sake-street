create or replace function public.can_append_order_items(target_order uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.orders
    where id = target_order
      and status = 'New'
      and created_at > now() - interval '10 minutes'
  );
$$;

revoke all on function public.can_append_order_items(uuid) from public;
grant execute on function public.can_append_order_items(uuid) to anon, authenticated;

drop policy if exists "public create order items" on public.order_items;
create policy "public create order items" on public.order_items
for insert to anon, authenticated
with check (public.can_append_order_items(order_id));
