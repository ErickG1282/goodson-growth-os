-- Break the order <-> payment-summary trigger cycle at the trigger boundary.
-- Requires 20260805_000000_upgrade_payment_summary_schema.sql.
--
-- Transaction payment change
--   -> gbgs_payments_recalculate_order_{insert|update|delete}
--   -> gbgs_recalculate_order_payment() updates the order once
--   -> gbgs_orders_sync_payment_summary
--   -> gbgs_sync_order_payment_summary() upserts the Order Summary row
--   -> STOP (Order Summary rows do not satisfy any recalculation trigger WHEN)

create or replace function public.gbgs_recalculate_order_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order_id uuid;
  target_order_ids uuid[];
  paid_total numeric(12,2);
  order_total numeric(12,2);
  next_balance numeric(12,2);
  next_status text;
begin
  if to_regclass('public.gbgs_payments') is null
     or to_regclass('public.gbgs_orders') is null then
    raise exception 'Payment recursion fix requires gbgs_payments and gbgs_orders';
  end if;

  target_order_ids := case
    when tg_op = 'DELETE' then array[old.order_id]
    when tg_op = 'UPDATE' and old.order_id is distinct from new.order_id
      then array[old.order_id, new.order_id]
    else array[new.order_id]
  end;

  foreach target_order_id in array target_order_ids loop
    select o.total into order_total
    from public.gbgs_orders o
    where o.id = target_order_id;

    -- A cascaded payment delete can run after its order has disappeared.
    if not found then
      continue;
    end if;

    select greatest(0, coalesce(sum(
      case when p.status = 'Refunded' then -p.amount else p.amount end
    ), 0))::numeric(12,2)
    into paid_total
    from public.gbgs_payments p
    where p.order_id = target_order_id
      and p.record_type = 'Transaction';

    next_balance := greatest(0, order_total - paid_total);
    next_status := case
      when paid_total <= 0 then 'Unpaid'
      when paid_total >= order_total then 'Paid'
      else 'Partial'
    end;

    -- The distinct check prevents redundant order events and downstream syncs.
    update public.gbgs_orders o
    set amount_paid = paid_total,
        balance_due = next_balance,
        payment_status = next_status
    where o.id = target_order_id
      and (o.amount_paid, o.balance_due, o.payment_status)
          is distinct from (paid_total, next_balance, next_status);
  end loop;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Replace the legacy trigger, which fired for Order Summary rows, with filtered
-- operation-specific triggers. The filter is evaluated before the function.
drop trigger if exists gbgs_payments_recalculate_order on public.gbgs_payments;
drop trigger if exists gbgs_payments_recalculate_order_insert on public.gbgs_payments;
drop trigger if exists gbgs_payments_recalculate_order_update on public.gbgs_payments;
drop trigger if exists gbgs_payments_recalculate_order_delete on public.gbgs_payments;

create trigger gbgs_payments_recalculate_order_insert
after insert on public.gbgs_payments
for each row
when (new.record_type = 'Transaction')
execute function public.gbgs_recalculate_order_payment();

create trigger gbgs_payments_recalculate_order_update
after update on public.gbgs_payments
for each row
when (old.record_type = 'Transaction' or new.record_type = 'Transaction')
execute function public.gbgs_recalculate_order_payment();

create trigger gbgs_payments_recalculate_order_delete
after delete on public.gbgs_payments
for each row
when (old.record_type = 'Transaction')
execute function public.gbgs_recalculate_order_payment();

-- Deployment assertions make a partially applied recursion fix fail loudly.
do $$
begin
  if exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'gbgs_payments'
      and t.tgname = 'gbgs_payments_recalculate_order' and not t.tgisinternal
  ) then
    raise exception 'Payment recursion fix failed: legacy payment trigger remains';
  end if;

  if (select count(*)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_proc p on p.oid = t.tgfoid
      where n.nspname = 'public' and c.relname = 'gbgs_payments'
        and p.proname = 'gbgs_recalculate_order_payment'
        and not t.tgisinternal and t.tgtype & 1 = 1
        and pg_get_triggerdef(t.oid) like '%record_type%Transaction%') <> 3 then
    raise exception 'Payment recursion fix failed: expected three filtered row triggers';
  end if;
end;
$$;
