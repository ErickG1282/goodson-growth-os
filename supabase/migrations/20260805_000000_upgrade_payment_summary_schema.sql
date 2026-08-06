-- Upgrade the original production payment schema to the payment-summary schema.
-- This migration is intentionally self-contained and safe after a partial prior run.

do $$
begin
  if to_regclass('public.gbgs_payments') is null then
    raise exception 'gbgs_payments does not exist; refusing to create a replacement and risk hiding missing production data';
  end if;
  if to_regclass('public.gbgs_orders') is null then
    raise exception 'gbgs_orders does not exist; payment summaries require the existing orders table';
  end if;
end;
$$;

-- The live table predates Phase 2A.5. Existing rows are real transactions.
alter table public.gbgs_payments add column if not exists record_type text;
alter table public.gbgs_payments add column if not exists amount_due numeric(12,2);
alter table public.gbgs_payments add column if not exists balance numeric(12,2);

update public.gbgs_payments set record_type = 'Transaction' where record_type is null;
update public.gbgs_payments set amount_due = 0 where amount_due is null;
update public.gbgs_payments set balance = 0 where balance is null;

alter table public.gbgs_payments alter column record_type set default 'Transaction';
alter table public.gbgs_payments alter column record_type set not null;
alter table public.gbgs_payments alter column amount_due set default 0;
alter table public.gbgs_payments alter column amount_due set not null;
alter table public.gbgs_payments alter column balance set default 0;
alter table public.gbgs_payments alter column balance set not null;
alter table public.gbgs_payments alter column amount set default 0;

-- Drop every legacy/partial check that governs one of the values being widened.
-- Catalog discovery handles production constraint names that differ from the repo.
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.gbgs_payments'::regclass
      and c.contype = 'c'
      and (
        pg_get_constraintdef(c.oid) ~* '\mamount\M'
        or pg_get_constraintdef(c.oid) ~* '\mstatus\M'
        or pg_get_constraintdef(c.oid) ~* '\mrecord_type\M'
      )
  loop
    execute format('alter table public.gbgs_payments drop constraint %I', constraint_row.conname);
  end loop;
end;
$$;

alter table public.gbgs_payments
  add constraint gbgs_payments_amount_check check (amount >= 0),
  add constraint gbgs_payments_status_check
    check (status in ('Unpaid', 'Partially Paid', 'Paid', 'Completed', 'Refunded')),
  add constraint gbgs_payments_record_type_check
    check (record_type in ('Order Summary', 'Transaction'));

create or replace function public.gbgs_payment_summary_status(p_status text)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(coalesce(p_status, 'unpaid'))
    when 'paid' then 'Paid'
    when 'partial' then 'Partially Paid'
    when 'partially paid' then 'Partially Paid'
    when 'refunded' then 'Refunded'
    else 'Unpaid'
  end
$$;

-- Install a summary-aware recalculator before creating/backfilling summaries.
create or replace function public.gbgs_recalculate_order_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order_id uuid;
  paid_total numeric(12,2);
  order_total numeric(12,2);
begin
  if (tg_op = 'DELETE' and old.record_type = 'Order Summary')
     or (tg_op <> 'DELETE' and new.record_type = 'Order Summary') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  target_order_id := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
  select o.total into order_total from public.gbgs_orders o where o.id = target_order_id;
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select greatest(0, coalesce(sum(case when p.status = 'Refunded' then -p.amount else p.amount end), 0))::numeric(12,2)
  into paid_total
  from public.gbgs_payments p
  where p.order_id = target_order_id and p.record_type = 'Transaction';

  update public.gbgs_orders
  set amount_paid = paid_total,
      balance_due = greatest(0, order_total - paid_total),
      payment_status = case when paid_total <= 0 then 'Unpaid' when paid_total >= order_total then 'Paid' else 'Partial' end
  where id = target_order_id;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists gbgs_payments_recalculate_order on public.gbgs_payments;
drop trigger if exists gbgs_payments_recalculate_order_insert on public.gbgs_payments;
drop trigger if exists gbgs_payments_recalculate_order_update on public.gbgs_payments;
drop trigger if exists gbgs_payments_recalculate_order_delete on public.gbgs_payments;
create trigger gbgs_payments_recalculate_order
after insert or update or delete on public.gbgs_payments
for each row execute function public.gbgs_recalculate_order_payment();

-- Do not silently discard data if an unknown partial deployment made duplicates.
do $$
begin
  if exists (
    select 1 from public.gbgs_payments
    where record_type = 'Order Summary'
    group by order_id having count(*) > 1
  ) then
    raise exception 'Multiple Order Summary rows exist for an order; preserving data and aborting instead of deleting a row';
  end if;
end;
$$;

create unique index if not exists gbgs_payments_order_summary_idx
  on public.gbgs_payments(order_id) where record_type = 'Order Summary';

create or replace function public.gbgs_sync_order_payment_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.gbgs_payments (
    business_id, order_id, customer_id, invoice_number, payment_method,
    amount, amount_due, balance, status, record_type, internal_notes
  ) values (
    new.business_id, new.id, new.customer_id, 'INV-' || new.order_number, 'Cash',
    coalesce(new.amount_paid, 0), coalesce(new.total, 0), coalesce(new.balance_due, new.total, 0),
    public.gbgs_payment_summary_status(new.payment_status), 'Order Summary',
    'Automatically synchronized from order'
  )
  on conflict (order_id) where record_type = 'Order Summary' do update set
    business_id = excluded.business_id,
    customer_id = excluded.customer_id,
    invoice_number = excluded.invoice_number,
    amount = excluded.amount,
    amount_due = excluded.amount_due,
    balance = excluded.balance,
    status = excluded.status,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists gbgs_orders_sync_payment_summary on public.gbgs_orders;
create trigger gbgs_orders_sync_payment_summary
after insert or update of customer_id, order_number, total, amount_paid, balance_due, payment_status
on public.gbgs_orders
for each row execute function public.gbgs_sync_order_payment_summary();

insert into public.gbgs_payments (
  business_id, order_id, customer_id, invoice_number, payment_method,
  amount, amount_due, balance, status, record_type, internal_notes
)
select o.business_id, o.id, o.customer_id, 'INV-' || o.order_number, 'Cash',
  coalesce(o.amount_paid, 0), coalesce(o.total, 0), coalesce(o.balance_due, o.total, 0),
  public.gbgs_payment_summary_status(o.payment_status), 'Order Summary',
  'Automatically synchronized from order'
from public.gbgs_orders o
on conflict (order_id) where record_type = 'Order Summary' do update set
  business_id = excluded.business_id,
  customer_id = excluded.customer_id,
  invoice_number = excluded.invoice_number,
  amount = excluded.amount,
  amount_due = excluded.amount_due,
  balance = excluded.balance,
  status = excluded.status,
  updated_at = now();

do $$
begin
  if exists (select 1 from public.gbgs_payments where record_type is null or amount_due is null or balance is null) then
    raise exception 'Payment schema upgrade failed: upgraded columns contain nulls';
  end if;
  if (select count(*) from public.gbgs_payments where record_type = 'Order Summary')
     <> (select count(*) from public.gbgs_orders) then
    raise exception 'Payment schema upgrade failed: expected exactly one summary per order';
  end if;
end;
$$;
