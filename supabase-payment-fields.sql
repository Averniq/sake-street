-- Run once for the payment capture feature. Staff-only order update policies already exist.
alter table public.orders
  add column if not exists payment_method text,
  add column if not exists payment_surcharge numeric(10,2) not null default 0,
  add column if not exists payment_total numeric(10,2),
  add column if not exists payment_tendered numeric(10,2),
  add column if not exists payment_change numeric(10,2),
  add column if not exists payment_note text not null default '',
  add column if not exists paid_at timestamptz;

alter table public.orders
  drop constraint if exists orders_payment_method_check;

alter table public.orders
  add constraint orders_payment_method_check
  check (payment_method is null or payment_method in ('Cash', 'Card', 'EFTPOS', 'Other'));

create index if not exists orders_restaurant_paid_at_idx
  on public.orders (restaurant_id, paid_at desc)
  where status = 'Paid';
