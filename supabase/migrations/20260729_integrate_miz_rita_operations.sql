create table if not exists public.gbgs_inventory_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.gbgs_businesses(id) on delete cascade,
  name text not null,
  category text not null default 'Ingredient',
  quantity numeric(12,3) not null default 0,
  unit text not null default 'lb',
  par_level numeric(12,3) not null default 0,
  cost_per_unit numeric(12,2) not null default 0,
  vendor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name)
);

create table if not exists public.gbgs_inventory_history (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.gbgs_businesses(id) on delete cascade,
  inventory_item_id uuid references public.gbgs_inventory_items(id) on delete set null,
  ingredient text not null,
  quantity_change numeric(12,3) not null,
  unit text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.gbgs_production_plans (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.gbgs_businesses(id) on delete cascade,
  plan_data jsonb not null default '[]'::jsonb,
  applied_plan_data jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.gbgs_order_workflow_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.gbgs_businesses(id) on delete cascade,
  order_id uuid not null references public.gbgs_orders(id) on delete cascade,
  status text not null,
  label text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.gbgs_kitchen_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.gbgs_businesses(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);

create index if not exists gbgs_inventory_items_business_idx on public.gbgs_inventory_items(business_id);
create index if not exists gbgs_inventory_history_business_idx on public.gbgs_inventory_history(business_id);
create index if not exists gbgs_workflow_events_order_idx on public.gbgs_order_workflow_events(order_id);

alter table public.gbgs_inventory_items enable row level security;
alter table public.gbgs_inventory_history enable row level security;
alter table public.gbgs_production_plans enable row level security;
alter table public.gbgs_order_workflow_events enable row level security;
alter table public.gbgs_kitchen_notes enable row level security;

drop policy if exists "Authenticated users manage Miz Rita inventory" on public.gbgs_inventory_items;
create policy "Authenticated users manage Miz Rita inventory" on public.gbgs_inventory_items for all to authenticated using (true) with check (true);
drop policy if exists "Authenticated users manage Miz Rita inventory history" on public.gbgs_inventory_history;
create policy "Authenticated users manage Miz Rita inventory history" on public.gbgs_inventory_history for all to authenticated using (true) with check (true);
drop policy if exists "Authenticated users manage Miz Rita production plans" on public.gbgs_production_plans;
create policy "Authenticated users manage Miz Rita production plans" on public.gbgs_production_plans for all to authenticated using (true) with check (true);
drop policy if exists "Authenticated users manage Miz Rita workflow events" on public.gbgs_order_workflow_events;
create policy "Authenticated users manage Miz Rita workflow events" on public.gbgs_order_workflow_events for all to authenticated using (true) with check (true);
drop policy if exists "Authenticated users manage Miz Rita kitchen notes" on public.gbgs_kitchen_notes;
create policy "Authenticated users manage Miz Rita kitchen notes" on public.gbgs_kitchen_notes for all to authenticated using (true) with check (true);

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'gbgs_inventory_items'
  ) then
    alter publication supabase_realtime add table public.gbgs_inventory_items;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'gbgs_inventory_history'
  ) then
    alter publication supabase_realtime add table public.gbgs_inventory_history;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'gbgs_production_plans'
  ) then
    alter publication supabase_realtime add table public.gbgs_production_plans;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'gbgs_order_workflow_events'
  ) then
    alter publication supabase_realtime add table public.gbgs_order_workflow_events;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'gbgs_kitchen_notes'
  ) then
    alter publication supabase_realtime add table public.gbgs_kitchen_notes;
  end if;
end;
$$;

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
  target_order_id := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
  select coalesce(sum(case when status = 'Refunded' then -amount else amount end), 0)
    into paid_total from public.gbgs_payments where order_id = target_order_id;
  select total into order_total from public.gbgs_orders where id = target_order_id;
  paid_total := greatest(0, paid_total);
  update public.gbgs_orders
    set amount_paid = paid_total,
        balance_due = greatest(0, order_total - paid_total),
        payment_status = case when paid_total <= 0 then 'Unpaid' when paid_total >= order_total then 'Paid' else 'Partial' end
    where id = target_order_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists gbgs_payments_recalculate_order on public.gbgs_payments;
create trigger gbgs_payments_recalculate_order
after insert or update or delete on public.gbgs_payments
for each row execute function public.gbgs_recalculate_order_payment();

create or replace function public.gbgs_sync_order_delivery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delivery_status text;
  delivery_address text;
begin
  delivery_status := case lower(new.order_status)
    when 'completed' then 'Delivered'
    when 'delivered' then 'Delivered'
    when 'out for delivery' then 'Out For Delivery'
    when 'ready for pickup' then 'Ready'
    when 'packaging' then 'Packaging'
    when 'cooking' then 'Preparing'
    when 'kitchen' then 'Preparing'
    when 'cancelled' then 'Cancelled'
    else 'New Order'
  end;
  delivery_address := nullif(substring(coalesce(new.notes, '') from '(?im)^Delivery Address:\s*(.+)$'), '');
  insert into public.gbgs_deliveries (business_id, order_id, delivery_type, status, scheduled_at, address, notes, activity_timeline)
  values (
    new.business_id,
    new.id,
    case when lower(coalesce(new.delivery_method, 'pickup')) = 'delivery' then 'Delivery' else 'Pickup' end,
    delivery_status,
    case when new.fulfillment_date is null then null else new.fulfillment_date::date + time '12:00' end,
    delivery_address,
    new.notes,
    jsonb_build_array(jsonb_build_object('status', 'Created', 'timestamp', now()))
  )
  on conflict (order_id) do update
    set status = excluded.status,
        delivery_type = excluded.delivery_type,
        scheduled_at = excluded.scheduled_at,
        address = excluded.address,
        notes = excluded.notes,
        completed_at = case when excluded.status = 'Delivered' then coalesce(public.gbgs_deliveries.completed_at, now()) else null end,
        activity_timeline = case when public.gbgs_deliveries.status is distinct from excluded.status then public.gbgs_deliveries.activity_timeline || jsonb_build_array(jsonb_build_object('status', excluded.status, 'timestamp', now())) else public.gbgs_deliveries.activity_timeline end,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists gbgs_orders_sync_delivery on public.gbgs_orders;
create trigger gbgs_orders_sync_delivery
after insert or update of order_status, fulfillment_date, delivery_method, notes on public.gbgs_orders
for each row execute function public.gbgs_sync_order_delivery();
