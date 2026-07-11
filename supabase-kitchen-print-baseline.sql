-- One-time baseline for the kitchen print bridge.
-- Run this once after supabase-kitchen-print-queue.sql and before starting
-- the bridge for the first time. Existing orders will not be back-printed.

update public.orders
set kitchen_printed_at = now(),
    kitchen_print_claimed_at = null,
    kitchen_print_error = 'Skipped during initial printer setup'
where kitchen_printed_at is null;

select count(*) as remaining_unprinted_orders
from public.orders
where kitchen_printed_at is null;
