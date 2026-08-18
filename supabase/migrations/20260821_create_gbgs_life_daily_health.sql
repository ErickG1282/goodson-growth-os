create table if not exists public.gbgs_life_daily_health (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  record_date date not null, workout_name text not null default '', workout_time time,
  workout_status text not null default 'Planned', workout_notes text not null default '',
  weight_lbs numeric(6,2), protein_target_g numeric(7,2), calorie_target numeric(8,2), water_target_oz numeric(7,2),
  calendar_event_id uuid unique references public.gbgs_calendar_events(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint gbgs_life_daily_health_user_date_key unique(user_id,record_date),
  constraint gbgs_life_daily_health_id_user_key unique(id,user_id),
  constraint gbgs_life_daily_health_status_check check(workout_status in('Planned','Completed','Skipped')),
  constraint gbgs_life_daily_health_values_check check(
    (weight_lbs is null or weight_lbs>=0) and (protein_target_g is null or protein_target_g>=0) and
    (calorie_target is null or calorie_target>=0) and (water_target_oz is null or water_target_oz>=0))
);

create table if not exists public.gbgs_life_health_exercises (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  daily_health_id uuid not null, exercise_name text not null, weight_used numeric(7,2), weight_unit text not null default 'lbs',
  notes text not null default '', sort_order smallint not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint gbgs_life_health_exercises_id_user_key unique(id,user_id),
  constraint gbgs_life_health_exercises_daily_user_fkey foreign key(daily_health_id,user_id) references public.gbgs_life_daily_health(id,user_id) on delete cascade,
  constraint gbgs_life_health_exercises_name_check check(length(trim(exercise_name))>0),
  constraint gbgs_life_health_exercises_weight_check check(weight_used is null or weight_used>=0)
);

create table if not exists public.gbgs_life_health_exercise_sets (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null, set_number smallint not null, reps smallint not null, created_at timestamptz not null default now(),
  constraint gbgs_life_health_exercise_sets_exercise_user_fkey foreign key(exercise_id,user_id) references public.gbgs_life_health_exercises(id,user_id) on delete cascade,
  constraint gbgs_life_health_exercise_sets_number_key unique(exercise_id,set_number),
  constraint gbgs_life_health_exercise_sets_values_check check(set_number>0 and reps>=0)
);

create table if not exists public.gbgs_life_health_meals (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  daily_health_id uuid not null, meal_label text not null, meal_name text not null, meal_time time, sort_order smallint not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint gbgs_life_health_meals_id_user_key unique(id,user_id),
  constraint gbgs_life_health_meals_daily_user_fkey foreign key(daily_health_id,user_id) references public.gbgs_life_daily_health(id,user_id) on delete cascade,
  constraint gbgs_life_health_meals_label_check check(length(trim(meal_label))>0),
  constraint gbgs_life_health_meals_name_check check(length(trim(meal_name))>0)
);

create table if not exists public.gbgs_life_health_food_items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  meal_id uuid not null, food_name text not null, serving_amount numeric(8,2), serving_unit text not null default '',
  grams_consumed numeric(8,2), protein_g numeric(8,2) not null default 0, carbohydrates_g numeric(8,2) not null default 0,
  fat_g numeric(8,2) not null default 0, calories numeric(8,2) not null default 0,
  nutrition_source text not null default 'Manual', external_food_id text, source_food_name text,
  protein_per_100g numeric(8,3), carbohydrates_per_100g numeric(8,3), fat_per_100g numeric(8,3), calories_per_100g numeric(8,3),
  manually_overridden boolean not null default false, sort_order smallint not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint gbgs_life_health_food_items_meal_user_fkey foreign key(meal_id,user_id) references public.gbgs_life_health_meals(id,user_id) on delete cascade,
  constraint gbgs_life_health_food_items_name_check check(length(trim(food_name))>0),
  constraint gbgs_life_health_food_items_values_check check((serving_amount is null or serving_amount>=0) and (grams_consumed is null or grams_consumed>=0) and protein_g>=0 and carbohydrates_g>=0 and fat_g>=0 and calories>=0 and
    (protein_per_100g is null or protein_per_100g>=0) and (carbohydrates_per_100g is null or carbohydrates_per_100g>=0) and (fat_per_100g is null or fat_per_100g>=0) and (calories_per_100g is null or calories_per_100g>=0))
);

create table if not exists public.gbgs_life_health_water_entries (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  daily_health_id uuid not null, amount_oz numeric(7,2) not null, consumed_at time not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint gbgs_life_health_water_entries_daily_user_fkey foreign key(daily_health_id,user_id) references public.gbgs_life_daily_health(id,user_id) on delete cascade,
  constraint gbgs_life_health_water_entries_amount_check check(amount_oz>0)
);

create table if not exists public.gbgs_life_health_supplements (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  daily_health_id uuid not null, supplement_name text not null, amount numeric(8,2), unit text not null default '',
  taken boolean not null default false, taken_at time, sort_order smallint not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint gbgs_life_health_supplements_daily_user_fkey foreign key(daily_health_id,user_id) references public.gbgs_life_daily_health(id,user_id) on delete cascade,
  constraint gbgs_life_health_supplements_name_check check(length(trim(supplement_name))>0),
  constraint gbgs_life_health_supplements_amount_check check(amount is null or amount>=0)
);

create index if not exists gbgs_life_daily_health_user_date_idx on public.gbgs_life_daily_health(user_id,record_date desc);
create index if not exists gbgs_life_health_exercises_daily_idx on public.gbgs_life_health_exercises(daily_health_id,sort_order);
create index if not exists gbgs_life_health_exercise_sets_exercise_idx on public.gbgs_life_health_exercise_sets(exercise_id,set_number);
create index if not exists gbgs_life_health_meals_daily_idx on public.gbgs_life_health_meals(daily_health_id,sort_order);
create index if not exists gbgs_life_health_food_items_meal_idx on public.gbgs_life_health_food_items(meal_id,sort_order);
create index if not exists gbgs_life_health_food_items_recent_idx on public.gbgs_life_health_food_items(user_id,created_at desc);
create index if not exists gbgs_life_health_food_items_external_idx on public.gbgs_life_health_food_items(user_id,nutrition_source,external_food_id);
create index if not exists gbgs_life_health_water_entries_daily_idx on public.gbgs_life_health_water_entries(daily_health_id,consumed_at);
create index if not exists gbgs_life_health_supplements_daily_idx on public.gbgs_life_health_supplements(daily_health_id,sort_order);

alter table public.gbgs_life_daily_health enable row level security;
alter table public.gbgs_life_health_exercises enable row level security;
alter table public.gbgs_life_health_exercise_sets enable row level security;
alter table public.gbgs_life_health_meals enable row level security;
alter table public.gbgs_life_health_food_items enable row level security;
alter table public.gbgs_life_health_water_entries enable row level security;
alter table public.gbgs_life_health_supplements enable row level security;

drop policy if exists "Users manage their own daily health" on public.gbgs_life_daily_health;
create policy "Users manage their own daily health" on public.gbgs_life_daily_health for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists "Users manage their own health exercises" on public.gbgs_life_health_exercises;
create policy "Users manage their own health exercises" on public.gbgs_life_health_exercises for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists "Users manage their own health exercise sets" on public.gbgs_life_health_exercise_sets;
create policy "Users manage their own health exercise sets" on public.gbgs_life_health_exercise_sets for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists "Users manage their own health meals" on public.gbgs_life_health_meals;
create policy "Users manage their own health meals" on public.gbgs_life_health_meals for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists "Users manage their own health food items" on public.gbgs_life_health_food_items;
create policy "Users manage their own health food items" on public.gbgs_life_health_food_items for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists "Users manage their own health water entries" on public.gbgs_life_health_water_entries;
create policy "Users manage their own health water entries" on public.gbgs_life_health_water_entries for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists "Users manage their own health supplements" on public.gbgs_life_health_supplements;
create policy "Users manage their own health supplements" on public.gbgs_life_health_supplements for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
