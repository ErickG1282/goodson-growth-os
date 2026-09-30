create table if not exists public.gbgs_truck_mileage_calculations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  load_opportunity_id uuid not null,
  provider text not null,
  status text not null check (status in ('AVAILABLE','NOT_CONFIGURED','UNAVAILABLE')),
  route_type text not null,
  vehicle_profile text not null,
  origin_used jsonb not null,
  destination_used jsonb not null,
  calculated_miles integer,
  warnings jsonb not null default '[]'::jsonb,
  provider_metadata jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now(),
  constraint gbgs_truck_mileage_calculations_owner_fk foreign key (load_opportunity_id, user_id)
    references public.gbgs_load_opportunities(id, user_id) on delete restrict
);

create index if not exists gbgs_truck_mileage_calculations_opportunity_idx
  on public.gbgs_truck_mileage_calculations(load_opportunity_id, calculated_at desc);

alter table public.gbgs_truck_mileage_calculations enable row level security;
create policy "Owners select truck mileage calculations" on public.gbgs_truck_mileage_calculations
  for select to authenticated using (auth.uid() = user_id);
create policy "Owners insert truck mileage calculations" on public.gbgs_truck_mileage_calculations
  for insert to authenticated with check (auth.uid() = user_id);
