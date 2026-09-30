create table public.gbgs_life_health_custom_foods (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  food_name text not null, brand_name text, serving_quantity numeric(10,3) not null, serving_unit text not null,
  serving_grams numeric(10,3), protein_g numeric(10,3) not null default 0,
  carbohydrates_g numeric(10,3) not null default 0, fat_g numeric(10,3) not null default 0,
  calories numeric(10,3) not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint gbgs_life_health_custom_foods_name_check check(length(trim(food_name))>0),
  constraint gbgs_life_health_custom_foods_serving_check check(serving_quantity>0 and length(trim(serving_unit))>0 and(serving_grams is null or serving_grams>0)),
  constraint gbgs_life_health_custom_foods_nutrition_check check(protein_g>=0 and carbohydrates_g>=0 and fat_g>=0 and calories>=0)
);

alter table public.gbgs_life_health_food_items add column custom_food_id uuid;
alter table public.gbgs_life_health_food_items add constraint gbgs_life_health_food_items_custom_food_fkey
  foreign key(custom_food_id) references public.gbgs_life_health_custom_foods(id) on delete set null;

create index gbgs_life_health_custom_foods_user_name_idx on public.gbgs_life_health_custom_foods(user_id,food_name);
create index gbgs_life_health_food_items_custom_food_idx on public.gbgs_life_health_food_items(custom_food_id) where custom_food_id is not null;

alter table public.gbgs_life_health_custom_foods enable row level security;
create policy "Users manage their own custom foods" on public.gbgs_life_health_custom_foods for all to authenticated
  using(auth.uid()=user_id) with check(auth.uid()=user_id);

create trigger gbgs_life_health_custom_foods_set_updated_at before update on public.gbgs_life_health_custom_foods
for each row execute function public.gbgs_life_health_saved_recipes_set_updated_at();

create function public.gbgs_life_health_validate_logged_custom_food_owner()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.custom_food_id is not null and not exists(
    select 1 from public.gbgs_life_health_custom_foods food where food.id=new.custom_food_id and food.user_id=new.user_id
  ) then raise exception 'Logged custom food must belong to the same user'; end if;
  return new;
end;
$$;

create trigger gbgs_life_health_food_items_validate_custom_food_owner before insert or update of custom_food_id,user_id
on public.gbgs_life_health_food_items for each row execute function public.gbgs_life_health_validate_logged_custom_food_owner();
