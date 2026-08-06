-- Phase 2A.5: database-owned downstream records for every order.

-- One order summary record powers Payment HQ while transaction rows preserve
-- the existing receipt/refund workflow.
alter table public.gbgs_payments add column if not exists record_type text not null default 'Transaction';
alter table public.gbgs_payments add column if not exists amount_due numeric(12,2) not null default 0;
alter table public.gbgs_payments add column if not exists balance numeric(12,2) not null default 0;
alter table public.gbgs_payments drop constraint if exists gbgs_payments_amount_check;
alter table public.gbgs_payments drop constraint if exists gbgs_payments_status_check;
alter table public.gbgs_payments drop constraint if exists gbgs_payments_record_type_check;
alter table public.gbgs_payments alter column amount set default 0;
alter table public.gbgs_payments add constraint gbgs_payments_amount_check check (amount >= 0);
alter table public.gbgs_payments add constraint gbgs_payments_status_check check (status in ('Unpaid', 'Partially Paid', 'Paid', 'Completed', 'Refunded'));
alter table public.gbgs_payments add constraint gbgs_payments_record_type_check check (record_type in ('Order Summary', 'Transaction'));
create unique index if not exists gbgs_payments_order_summary_idx on public.gbgs_payments(order_id) where record_type = 'Order Summary';

create or replace function public.gbgs_payment_summary_status(p_status text)
returns text language sql immutable as $$
  select case lower(coalesce(p_status, 'unpaid'))
    when 'paid' then 'Paid'
    when 'partial' then 'Partially Paid'
    when 'partially paid' then 'Partially Paid'
    when 'refunded' then 'Refunded'
    else 'Unpaid'
  end
$$;

create or replace function public.gbgs_sync_order_payment_summary()
returns trigger language plpgsql security definer set search_path = public as $$
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
after insert or update of customer_id, order_number, total, amount_paid, balance_due, payment_status on public.gbgs_orders
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
  customer_id = excluded.customer_id, invoice_number = excluded.invoice_number,
  amount = excluded.amount, amount_due = excluded.amount_due,
  balance = excluded.balance, status = excluded.status, updated_at = now();

-- Transaction rows continue to recalculate the parent order; summary-row
-- updates return immediately to avoid trigger recursion.
create or replace function public.gbgs_recalculate_order_payment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_order_id uuid;
  paid_total numeric(12,2);
  order_total numeric(12,2);
begin
  if (tg_op = 'DELETE' and old.record_type = 'Order Summary')
    or (tg_op <> 'DELETE' and new.record_type = 'Order Summary') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  target_order_id := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
  select coalesce(sum(case when status = 'Refunded' then -amount else amount end), 0)
  into paid_total from public.gbgs_payments
  where order_id = target_order_id and record_type = 'Transaction';
  select total into order_total from public.gbgs_orders where id = target_order_id;
  paid_total := greatest(0, paid_total);
  update public.gbgs_orders set
    amount_paid = paid_total,
    balance_due = greatest(0, order_total - paid_total),
    payment_status = case when paid_total <= 0 then 'Unpaid' when paid_total >= order_total then 'Paid' else 'Partial' end
  where id = target_order_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.gbgs_set_order_payment_status(
  p_business_id uuid,
  p_order_id uuid,
  p_payment_status text
)
returns void language plpgsql security invoker set search_path = public as $$
declare
  normalized text := lower(p_payment_status);
begin
  if normalized not in ('unpaid', 'partial', 'partially paid', 'paid', 'refunded') then
    raise exception 'Unsupported payment status';
  end if;
  update public.gbgs_orders set
    payment_status = case
      when normalized = 'paid' then 'Paid'
      when normalized in ('partial', 'partially paid') then 'Partial'
      when normalized = 'refunded' then 'Refunded'
      else 'Unpaid' end,
    amount_paid = case
      when normalized = 'paid' then total
      when normalized in ('partial', 'partially paid') then least(total, greatest(amount_paid, 0))
      else 0 end,
    balance_due = case
      when normalized = 'paid' then 0
      when normalized in ('partial', 'partially paid') then greatest(0, total - greatest(amount_paid, 0))
      else total end
  where id = p_order_id and business_id = p_business_id;
  if not found then raise exception 'Order does not belong to this business'; end if;
  insert into public.gbgs_order_workflow_events (business_id, order_id, status, label)
  values (p_business_id, p_order_id, p_payment_status, 'Payment moved to ' || p_payment_status);
end;
$$;
grant execute on function public.gbgs_set_order_payment_status(uuid, uuid, text) to authenticated;

create or replace function public.gbgs_sync_order_calendar_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare event_user_id uuid;
begin
  if new.fulfillment_date is null then
    delete from public.gbgs_calendar_events where source = 'Order' and source_id = new.id;
    return new;
  end if;
  event_user_id := new.created_by;
  if event_user_id is null then
    select member.user_id into event_user_id from public.gbgs_business_members member
    where member.business_id = new.business_id
    order by case lower(coalesce(member.role, '')) when 'owner' then 0 when 'admin' then 1 else 2 end,
      member.created_at, member.id limit 1;
  end if;
  if event_user_id is null then
    raise exception 'Cannot create calendar event for order %: no creator or business member', new.id;
  end if;
  update public.gbgs_calendar_events set
    user_id = event_user_id,
    title = coalesce(new.delivery_method, 'Pickup') || ' - ' || new.order_number,
    event_date = new.fulfillment_date, start_time = time '12:00', end_time = null,
    location = null, notes = new.notes,
    completed = lower(new.order_status) in ('completed', 'delivered'),
    category = 'Fulfillment', updated_at = now()
  where source = 'Order' and source_id = new.id;
  if not found then
    insert into public.gbgs_calendar_events
      (user_id, title, event_date, start_time, end_time, location, notes, completed, source, source_id, category)
    values
      (event_user_id, coalesce(new.delivery_method, 'Pickup') || ' - ' || new.order_number,
       new.fulfillment_date, time '12:00', null, null, new.notes,
       lower(new.order_status) in ('completed', 'delivered'), 'Order', new.id, 'Fulfillment');
  end if;
  return new;
end;
$$;

drop trigger if exists gbgs_orders_sync_calendar_event on public.gbgs_orders;
create trigger gbgs_orders_sync_calendar_event
after insert or update of fulfillment_date, order_status, delivery_method, customer_id, notes on public.gbgs_orders
for each row execute function public.gbgs_sync_order_calendar_event();

insert into public.gbgs_calendar_events
  (user_id, title, event_date, start_time, end_time, location, notes, completed, source, source_id, category)
select coalesce(o.created_by, owner.user_id),
  coalesce(o.delivery_method, 'Pickup') || ' - ' || o.order_number,
  o.fulfillment_date, time '12:00', null, null, o.notes,
  lower(o.order_status) in ('completed', 'delivered'), 'Order', o.id, 'Fulfillment'
from public.gbgs_orders o
left join lateral (
  select member.user_id from public.gbgs_business_members member
  where member.business_id = o.business_id
  order by case lower(coalesce(member.role, '')) when 'owner' then 0 when 'admin' then 1 else 2 end,
    member.created_at, member.id limit 1
) owner on true
where o.fulfillment_date is not null
  and coalesce(o.created_by, owner.user_id) is not null
  and not exists (
    select 1 from public.gbgs_calendar_events event
    where event.source = 'Order' and event.source_id = o.id
  );
