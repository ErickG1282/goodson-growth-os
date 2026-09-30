create table if not exists public.gbgs_quote_settings (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete cascade,
  short_haul_max_miles integer not null default 100 check (short_haul_max_miles >= 0),
  short_haul_minimum numeric(12,2) not null default 600 check (short_haul_minimum >= 0),
  max_weight_lbs integer not null default 40000 check (max_weight_lbs > 0),
  additional_stop_charge numeric(12,2) not null default 100 check (additional_stop_charge >= 0),
  target_rpm numeric(8,2) not null default 2.50 check (target_rpm >= 0),
  hard_floor_rpm numeric(8,2) not null default 2.25 check (hard_floor_rpm >= 0),
  round_quote_to numeric(12,2) not null default 25 check (round_quote_to > 0),
  auto_quote_enabled boolean not null default false, auto_decline_overweight boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.gbgs_quote_distance_rules (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  min_miles integer not null check (min_miles >= 0), max_miles integer check (max_miles is null or max_miles >= min_miles),
  opening_rpm numeric(8,2), minimum_charge numeric(12,2), sort_order integer not null default 0, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id, min_miles), check (opening_rpm is not null or minimum_charge is not null)
);

create table if not exists public.gbgs_quote_lane_rules (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  origin_state text not null default 'GA', destination_region text not null, pricing_level text not null,
  premium_per_mile numeric(8,2) not null default 0 check (premium_per_mile >= 0), active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id, origin_state, destination_region)
);

create table if not exists public.gbgs_quote_equipment_rules (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  equipment_type text not null, active boolean not null default true, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(user_id, equipment_type)
);

create table if not exists public.gbgs_quote_customers (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  customer_name text not null, company_name text not null, email text, phone text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.gbgs_quote_requests (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid references public.gbgs_quote_customers(id) on delete set null, customer_name text, customer_company text, customer_email text,
  origin_city text not null, origin_state text not null, origin_zip text, destination_city text not null, destination_state text not null, destination_zip text,
  loaded_miles numeric(10,2) not null check (loaded_miles >= 0), deadhead_miles numeric(10,2) not null default 0 check (deadhead_miles >= 0),
  weight_lbs integer not null check (weight_lbs >= 0), equipment_type text not null, pickup_at timestamptz, delivery_at timestamptz,
  pickup_count integer not null default 1 check (pickup_count >= 1), delivery_count integer not null default 1 check (delivery_count >= 1),
  email_subject text, original_email_body text, external_message_id text, source text not null default 'Manual' check (source in ('Manual','Email')),
  base_rate numeric(12,2), opening_distance_rpm numeric(8,2), lane_premium numeric(12,2), stop_charges numeric(12,2),
  calculated_quote numeric(12,2), calculated_rpm numeric(8,2), status text not null default 'New' check (status in ('New','Needs Review','Quoted','Declined','Accepted','Rejected','Expired')),
  decline_reason text, review_reason text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.gbgs_quote_history (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  quote_request_id uuid not null references public.gbgs_quote_requests(id) on delete cascade, action text not null,
  from_status text, to_status text, quoted_amount numeric(12,2), details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create index if not exists gbgs_quote_requests_user_created_idx on public.gbgs_quote_requests(user_id, created_at desc);
create index if not exists gbgs_quote_history_user_created_idx on public.gbgs_quote_history(user_id, created_at desc);
create index if not exists gbgs_quote_customers_user_company_idx on public.gbgs_quote_customers(user_id, company_name);

do $$ declare table_name text; begin
  foreach table_name in array array['gbgs_quote_settings','gbgs_quote_distance_rules','gbgs_quote_lane_rules','gbgs_quote_equipment_rules','gbgs_quote_customers','gbgs_quote_requests','gbgs_quote_history'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists "Users manage their own %s" on public.%I', table_name, table_name);
    execute format('create policy "Users manage their own %s" on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', table_name, table_name);
  end loop;
end $$;

create or replace function public.gbgs_seed_quote_rules(target_user_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  insert into public.gbgs_quote_settings(user_id) values(target_user_id) on conflict(user_id) do nothing;
  insert into public.gbgs_quote_distance_rules(user_id,min_miles,max_miles,opening_rpm,minimum_charge,sort_order) values
    (target_user_id,0,100,null,600,1),(target_user_id,101,250,3.25,null,2),(target_user_id,251,500,3.00,null,3),
    (target_user_id,501,750,2.90,null,4),(target_user_id,751,1000,2.80,null,5),(target_user_id,1001,null,2.75,null,6) on conflict(user_id,min_miles) do nothing;
  insert into public.gbgs_quote_equipment_rules(user_id,equipment_type) values(target_user_id,'Dry Van'),(target_user_id,'Power Only') on conflict(user_id,equipment_type) do nothing;
  insert into public.gbgs_quote_lane_rules(user_id,origin_state,destination_region,pricing_level,premium_per_mile) values
    (target_user_id,'GA','Georgia','Normal',0),(target_user_id,'GA','Tennessee','Normal',0),(target_user_id,'GA','North Carolina','Normal',0),
    (target_user_id,'GA','South Carolina','Normal',0),(target_user_id,'GA','Kentucky','Normal',0),(target_user_id,'GA','Virginia','Normal',0),
    (target_user_id,'GA','Alabama','Moderate',0.10),(target_user_id,'GA','North Florida','Moderate',0.15),(target_user_id,'GA','Central Florida','Premium',0.25),
    (target_user_id,'GA','South Florida','High Premium',0.50),(target_user_id,'GA','Mississippi','Premium',0.20),(target_user_id,'GA','Louisiana','Premium',0.25)
    on conflict(user_id,origin_state,destination_region) do nothing;
end $$;

create or replace function public.gbgs_seed_quote_rules_for_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin perform public.gbgs_seed_quote_rules(new.id); return new; end $$;
drop trigger if exists gbgs_seed_quote_rules_after_user_insert on auth.users;
create trigger gbgs_seed_quote_rules_after_user_insert after insert on auth.users for each row execute function public.gbgs_seed_quote_rules_for_new_user();
do $$ declare existing_user record; begin for existing_user in select id from auth.users loop perform public.gbgs_seed_quote_rules(existing_user.id); end loop; end $$;

revoke all on function public.gbgs_seed_quote_rules(uuid) from public;
revoke all on function public.gbgs_seed_quote_rules(uuid) from anon, authenticated;
grant execute on function public.gbgs_seed_quote_rules(uuid) to service_role;

create or replace function public.gbgs_quote_set_updated_at() returns trigger language plpgsql set search_path=public as $$ begin new.updated_at=now(); return new; end $$;
do $$ declare table_name text; begin
  foreach table_name in array array['gbgs_quote_settings','gbgs_quote_distance_rules','gbgs_quote_lane_rules','gbgs_quote_equipment_rules','gbgs_quote_customers','gbgs_quote_requests'] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_set_updated_at', table_name);
    execute format('create trigger %I before update on public.%I for each row execute function public.gbgs_quote_set_updated_at()', table_name || '_set_updated_at', table_name);
  end loop;
end $$;
