create table if not exists public.gbgs_menu_meals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.gbgs_businesses(id) on delete cascade,
  name text not null,
  description text,
  photo_url text,
  category text not null default 'Lunch',
  serving_size text,
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  fiber_g numeric not null default 0,
  sugar_g numeric not null default 0,
  sodium_mg numeric not null default 0,
  selling_price numeric(10,2) not null default 0,
  food_cost numeric(10,2) not null default 0,
  cooking_instructions text,
  packaging_instructions text,
  heating_instructions text,
  customer_notes text,
  status text not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gbgs_menu_ingredients (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.gbgs_menu_meals(id) on delete cascade,
  ingredient_name text not null,
  quantity_required numeric not null default 0,
  unit text not null default 'oz',
  created_at timestamptz not null default now()
);

create index if not exists gbgs_menu_meals_business_id_idx
  on public.gbgs_menu_meals(business_id);

create index if not exists gbgs_menu_ingredients_meal_id_idx
  on public.gbgs_menu_ingredients(meal_id);

alter table public.gbgs_menu_meals enable row level security;
alter table public.gbgs_menu_ingredients enable row level security;

drop policy if exists "Authenticated users can manage menu meals" on public.gbgs_menu_meals;
create policy "Authenticated users can manage menu meals"
  on public.gbgs_menu_meals for all to authenticated
  using (true) with check (true);

drop policy if exists "Authenticated users can manage menu ingredients" on public.gbgs_menu_ingredients;
create policy "Authenticated users can manage menu ingredients"
  on public.gbgs_menu_ingredients for all to authenticated
  using (true) with check (true);

alter publication supabase_realtime add table public.gbgs_menu_meals;
alter publication supabase_realtime add table public.gbgs_menu_ingredients;
