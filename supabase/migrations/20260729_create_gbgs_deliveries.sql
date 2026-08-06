create table if not exists public.gbgs_deliveries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.gbgs_businesses(id) on delete cascade,
  order_id uuid not null unique references public.gbgs_orders(id) on delete cascade,
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
  updated_at timestamptz not null default now()
);

create index if not exists gbgs_deliveries_business_id_idx on public.gbgs_deliveries(business_id);
create index if not exists gbgs_deliveries_business_schedule_idx on public.gbgs_deliveries(business_id, scheduled_at);
create index if not exists gbgs_deliveries_business_status_idx on public.gbgs_deliveries(business_id, status);

alter table public.gbgs_deliveries enable row level security;
create policy "Authenticated users manage Miz Rita deliveries"
  on public.gbgs_deliveries for all to authenticated using (true) with check (true);

alter publication supabase_realtime add table public.gbgs_deliveries;
