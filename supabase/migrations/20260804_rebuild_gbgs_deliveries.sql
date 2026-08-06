-- Replace the legacy delivery list with the order-backed GBGS delivery model.
drop table if exists public.deliveries cascade;

create table if not exists public.gbgs_deliveries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.gbgs_businesses(id) on delete cascade,
  order_id uuid not null references public.gbgs_orders(id) on delete cascade,
  delivery_type text not null check (delivery_type in ('Pickup', 'Delivery')),
  driver_name text,
  driver_phone text,
  status text not null default 'New Order' check (status in ('New Order', 'Preparing', 'Packaging', 'Ready', 'Out For Delivery', 'Delivered', 'Cancelled')),
  scheduled_at timestamptz,
  completed_at timestamptz,
  address text,
  notes text,
  activity_timeline jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gbgs_deliveries_order_id_key unique (order_id)
);

-- Reconcile environments where an earlier draft of gbgs_deliveries exists.
alter table public.gbgs_deliveries add column if not exists delivery_type text;
alter table public.gbgs_deliveries add column if not exists driver_name text;
alter table public.gbgs_deliveries add column if not exists driver_phone text;
alter table public.gbgs_deliveries add column if not exists completed_at timestamptz;
alter table public.gbgs_deliveries add column if not exists notes text;
alter table public.gbgs_deliveries add column if not exists activity_timeline jsonb not null default '[]'::jsonb;
alter table public.gbgs_deliveries drop constraint if exists gbgs_deliveries_status_check;
alter table public.gbgs_deliveries drop constraint if exists gbgs_deliveries_delivery_type_check;
update public.gbgs_deliveries d
set delivery_type = case when lower(coalesce(o.delivery_method, 'pickup')) = 'delivery' then 'Delivery' else 'Pickup' end,
    status = case lower(coalesce(o.order_status, 'new order'))
      when 'cancelled' then 'Cancelled' when 'canceled' then 'Cancelled'
      when 'completed' then 'Delivered' when 'delivered' then 'Delivered'
      when 'out for delivery' then 'Out For Delivery'
      when 'ready for pickup' then 'Ready'
      when 'packaging' then 'Packaging'
      when 'kitchen' then 'Preparing' when 'cooking' then 'Preparing' when 'preparing' then 'Preparing'
      else 'New Order' end
from public.gbgs_orders o
where o.id = d.order_id;
alter table public.gbgs_deliveries alter column delivery_type set not null;
alter table public.gbgs_deliveries add constraint gbgs_deliveries_delivery_type_check check (delivery_type in ('Pickup', 'Delivery'));
alter table public.gbgs_deliveries add constraint gbgs_deliveries_status_check check (status in ('New Order', 'Preparing', 'Packaging', 'Ready', 'Out For Delivery', 'Delivered', 'Cancelled'));
alter table public.gbgs_deliveries drop column if exists driver_id;
alter table public.gbgs_deliveries drop column if exists actual_departure_at;
alter table public.gbgs_deliveries drop column if exists delivered_at;
alter table public.gbgs_deliveries drop column if exists special_instructions;
alter table public.gbgs_deliveries drop column if exists internal_notes;

create unique index if not exists gbgs_deliveries_order_id_idx on public.gbgs_deliveries(order_id);
create index if not exists gbgs_deliveries_business_id_idx on public.gbgs_deliveries(business_id);
create index if not exists gbgs_deliveries_business_schedule_idx on public.gbgs_deliveries(business_id, scheduled_at);
create index if not exists gbgs_deliveries_business_status_idx on public.gbgs_deliveries(business_id, status);

alter table public.gbgs_deliveries enable row level security;
drop policy if exists "Authenticated users manage Miz Rita deliveries" on public.gbgs_deliveries;
create policy "Authenticated users manage Miz Rita deliveries"
  on public.gbgs_deliveries for all to authenticated using (true) with check (true);

do $$ begin
  alter publication supabase_realtime add table public.gbgs_deliveries;
exception when duplicate_object then null;
end $$;

create or replace function public.gbgs_delivery_status(p_order_status text)
returns text language sql immutable as $$
  select case lower(coalesce(p_order_status, 'new order'))
    when 'cancelled' then 'Cancelled' when 'canceled' then 'Cancelled'
    when 'completed' then 'Delivered' when 'delivered' then 'Delivered'
    when 'out for delivery' then 'Out For Delivery'
    when 'ready for pickup' then 'Ready' when 'ready' then 'Ready'
    when 'packaging' then 'Packaging'
    when 'kitchen' then 'Preparing' when 'cooking' then 'Preparing' when 'preparing' then 'Preparing'
    else 'New Order'
  end
$$;

create or replace function public.gbgs_sync_order_delivery()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  next_status text := public.gbgs_delivery_status(new.order_status);
  next_type text := case when lower(coalesce(new.delivery_method, 'pickup')) = 'delivery' then 'Delivery' else 'Pickup' end;
  next_address text := nullif(substring(coalesce(new.notes, '') from '(?im)^Delivery Address:\s*(.+)$'), '');
begin
  insert into public.gbgs_deliveries (
    business_id, order_id, delivery_type, status, scheduled_at, completed_at,
    address, notes, activity_timeline
  ) values (
    new.business_id, new.id, next_type, next_status,
    case when new.fulfillment_date is null then null else new.fulfillment_date::date + time '12:00' end,
    case when next_status = 'Delivered' then now() else null end,
    next_address, new.notes,
    jsonb_build_array(jsonb_build_object('status', 'Created', 'timestamp', now()))
      || case when next_status = 'New Order' then '[]'::jsonb else jsonb_build_array(jsonb_build_object('status', next_status, 'timestamp', now())) end
  )
  on conflict (order_id) do update set
    business_id = excluded.business_id,
    delivery_type = excluded.delivery_type,
    scheduled_at = excluded.scheduled_at,
    address = excluded.address,
    notes = excluded.notes,
    status = excluded.status,
    completed_at = case
      when excluded.status = 'Delivered' then coalesce(public.gbgs_deliveries.completed_at, now())
      when excluded.status <> 'Delivered' then null
      else public.gbgs_deliveries.completed_at end,
    activity_timeline = case
      when public.gbgs_deliveries.status is distinct from excluded.status
      then coalesce(public.gbgs_deliveries.activity_timeline, '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object('status', excluded.status, 'timestamp', now()))
      else public.gbgs_deliveries.activity_timeline end,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists gbgs_orders_sync_delivery on public.gbgs_orders;
create trigger gbgs_orders_sync_delivery
after insert or update of order_status, fulfillment_date, delivery_method, notes on public.gbgs_orders
for each row execute function public.gbgs_sync_order_delivery();

-- Backfill one delivery per existing order. The trigger owns all future sync.
insert into public.gbgs_deliveries (
  business_id, order_id, delivery_type, status, scheduled_at, completed_at,
  address, notes, activity_timeline
)
select o.business_id, o.id,
  case when lower(coalesce(o.delivery_method, 'pickup')) = 'delivery' then 'Delivery' else 'Pickup' end,
  public.gbgs_delivery_status(o.order_status),
  case when o.fulfillment_date is null then null else o.fulfillment_date::date + time '12:00' end,
  case when public.gbgs_delivery_status(o.order_status) = 'Delivered' then now() else null end,
  nullif(substring(coalesce(o.notes, '') from '(?im)^Delivery Address:\s*(.+)$'), ''), o.notes,
  jsonb_build_array(jsonb_build_object('status', 'Created', 'timestamp', now()))
    || case when public.gbgs_delivery_status(o.order_status) = 'New Order' then '[]'::jsonb else jsonb_build_array(jsonb_build_object('status', public.gbgs_delivery_status(o.order_status), 'timestamp', now())) end
from public.gbgs_orders o
on conflict (order_id) do update set
  delivery_type = excluded.delivery_type, status = excluded.status,
  scheduled_at = excluded.scheduled_at, address = excluded.address,
  notes = excluded.notes, updated_at = now();

drop function if exists public.gbgs_transition_order(uuid, uuid, text, text, text, uuid);
create or replace function public.gbgs_transition_order(
  p_business_id uuid,
  p_order_id uuid,
  p_order_status text,
  p_label text
)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not exists (
    select 1 from public.gbgs_orders where id = p_order_id and business_id = p_business_id
  ) then raise exception 'Order does not belong to this business'; end if;

  update public.gbgs_orders set order_status = p_order_status where id = p_order_id;
  insert into public.gbgs_order_workflow_events (business_id, order_id, status, label)
  values (p_business_id, p_order_id, p_order_status, p_label);
end;
$$;

-- Deployment assertions: fail the migration if any required object or cleanup
-- condition is missing.
do $$
declare
  object_definition text;
begin
  if to_regclass('public.gbgs_deliveries') is null then
    raise exception 'Delivery migration verification failed: public.gbgs_deliveries is missing';
  end if;
  if to_regprocedure('public.gbgs_sync_order_delivery()') is null then
    raise exception 'Delivery migration verification failed: gbgs_sync_order_delivery() is missing';
  end if;
  if to_regprocedure('public.gbgs_transition_order(uuid,uuid,text,text)') is null then
    raise exception 'Delivery migration verification failed: updated gbgs_transition_order() is missing';
  end if;
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'gbgs_orders'
      and t.tgname = 'gbgs_orders_sync_delivery' and not t.tgisinternal
  ) then
    raise exception 'Delivery migration verification failed: order synchronization trigger is missing';
  end if;

  for object_definition in
    select pg_get_functiondef(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
    union all
    select pg_get_triggerdef(t.oid)
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal
  loop
    if object_definition ~* 'public[.]deliveries' then
      raise exception 'Delivery migration verification failed: a function or trigger still references public.deliveries: %', object_definition;
    end if;
  end loop;
end;
$$;
