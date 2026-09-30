create table public.gbgs_life_health_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_name text not null,

  total_protein_g numeric(10,3) not null default 0,
  total_carbohydrates_g numeric(10,3) not null default 0,
  total_fat_g numeric(10,3) not null default 0,
  total_calories numeric(10,3) not null default 0,

  yield_quantity numeric(10,3) not null,
  yield_unit text not null,

  protein_per_yield_unit_g numeric(12,4)
    generated always as (total_protein_g / yield_quantity) stored,
  carbohydrates_per_yield_unit_g numeric(12,4)
    generated always as (total_carbohydrates_g / yield_quantity) stored,
  fat_per_yield_unit_g numeric(12,4)
    generated always as (total_fat_g / yield_quantity) stored,
  calories_per_yield_unit numeric(12,4)
    generated always as (total_calories / yield_quantity) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint gbgs_life_health_recipes_id_user_key
    unique (id, user_id),
  constraint gbgs_life_health_recipes_name_check
    check (length(trim(recipe_name)) > 0),
  constraint gbgs_life_health_recipes_yield_check
    check (yield_quantity > 0 and length(trim(yield_unit)) > 0),
  constraint gbgs_life_health_recipes_macros_check
    check (
      total_protein_g >= 0
      and total_carbohydrates_g >= 0
      and total_fat_g >= 0
      and total_calories >= 0
    )
);

create table public.gbgs_life_health_recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null,

  ingredient_name text not null,
  quantity numeric(10,3),
  unit text not null default '',
  grams numeric(10,3),

  nutrition_source text not null default 'Manual',
  external_food_id text,
  source_food_name text,

  protein_per_100g numeric(10,3),
  carbohydrates_per_100g numeric(10,3),
  fat_per_100g numeric(10,3),
  calories_per_100g numeric(10,3),

  protein_g numeric(10,3) not null default 0,
  carbohydrates_g numeric(10,3) not null default 0,
  fat_g numeric(10,3) not null default 0,
  calories numeric(10,3) not null default 0,

  manually_overridden boolean not null default false,
  sort_order smallint not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint gbgs_life_health_recipe_ingredients_recipe_user_fkey
    foreign key (recipe_id, user_id)
    references public.gbgs_life_health_recipes(id, user_id)
    on delete cascade,
  constraint gbgs_life_health_recipe_ingredients_name_check
    check (length(trim(ingredient_name)) > 0),
  constraint gbgs_life_health_recipe_ingredients_values_check
    check (
      (quantity is null or quantity >= 0)
      and (grams is null or grams >= 0)
      and protein_g >= 0
      and carbohydrates_g >= 0
      and fat_g >= 0
      and calories >= 0
      and (protein_per_100g is null or protein_per_100g >= 0)
      and (carbohydrates_per_100g is null or carbohydrates_per_100g >= 0)
      and (fat_per_100g is null or fat_per_100g >= 0)
      and (calories_per_100g is null or calories_per_100g >= 0)
    )
);

alter table public.gbgs_life_health_food_items
  add column recipe_id uuid;

alter table public.gbgs_life_health_food_items
  add constraint gbgs_life_health_food_items_recipe_fkey
  foreign key (recipe_id)
  references public.gbgs_life_health_recipes(id)
  on delete set null;

create index gbgs_life_health_recipes_user_name_idx
  on public.gbgs_life_health_recipes(user_id, recipe_name);

create index gbgs_life_health_recipe_ingredients_recipe_sort_idx
  on public.gbgs_life_health_recipe_ingredients(recipe_id, sort_order);

create index gbgs_life_health_food_items_recipe_idx
  on public.gbgs_life_health_food_items(recipe_id)
  where recipe_id is not null;

alter table public.gbgs_life_health_recipes enable row level security;
alter table public.gbgs_life_health_recipe_ingredients enable row level security;

create policy "Users manage their own health recipes"
  on public.gbgs_life_health_recipes
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own health recipe ingredients"
  on public.gbgs_life_health_recipe_ingredients
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create function public.gbgs_life_health_saved_recipes_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger gbgs_life_health_recipes_set_updated_at
before update on public.gbgs_life_health_recipes
for each row
execute function public.gbgs_life_health_saved_recipes_set_updated_at();

create trigger gbgs_life_health_recipe_ingredients_set_updated_at
before update on public.gbgs_life_health_recipe_ingredients
for each row
execute function public.gbgs_life_health_saved_recipes_set_updated_at();

create function public.gbgs_life_health_validate_logged_recipe_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.recipe_id is not null
    and not exists (
      select 1
      from public.gbgs_life_health_recipes recipe
      where recipe.id = new.recipe_id
        and recipe.user_id = new.user_id
    )
  then
    raise exception 'Logged recipe must belong to the same user';
  end if;

  return new;
end;
$$;

create trigger gbgs_life_health_food_items_validate_recipe_owner
before insert or update of recipe_id, user_id
on public.gbgs_life_health_food_items
for each row
execute function public.gbgs_life_health_validate_logged_recipe_owner();
