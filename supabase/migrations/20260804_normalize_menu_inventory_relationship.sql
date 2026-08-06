alter table public.gbgs_inventory_items
  add column if not exists is_active boolean not null default true;

alter table public.gbgs_menu_ingredients
  add column if not exists preparation_notes text;

-- One-time legacy backfill. Runtime Menu and Kitchen workflows never match by name.
update public.gbgs_menu_ingredients recipe
set inventory_item_id = inventory.id
from public.gbgs_menu_meals meal
join public.gbgs_inventory_items inventory
  on inventory.business_id = meal.business_id
where recipe.meal_id = meal.id
  and recipe.inventory_item_id is null
  and lower(inventory.name) = lower(recipe.ingredient_name);

do $$
begin
  if exists (select 1 from public.gbgs_menu_ingredients where inventory_item_id is null) then
    raise exception 'Legacy recipe ingredients must be linked to inventory before normalization can finish';
  end if;
end $$;

create or replace function public.gbgs_replace_meal_recipe(
  p_business_id uuid,
  p_meal_id uuid,
  p_ingredients jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  ingredient jsonb;
  retained_ids uuid[] := '{}';
  saved_id uuid;
begin
  if not exists (
    select 1 from public.gbgs_menu_meals
    where id = p_meal_id and business_id = p_business_id
  ) then
    raise exception 'Meal does not belong to this business';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb)) value
    group by value->>'inventory_item_id'
    having count(*) > 1
  ) then
    raise exception 'Each ingredient can only be added once per recipe';
  end if;

  for ingredient in select value from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb))
  loop
    if nullif(ingredient->>'inventory_item_id', '') is null then
      raise exception 'Please select an inventory ingredient for every recipe row';
    end if;
    if not exists (
      select 1 from public.gbgs_inventory_items
      where id = (ingredient->>'inventory_item_id')::uuid
        and business_id = p_business_id
        and is_active
    ) then
      raise exception 'Selected ingredient is not an active inventory item for this business';
    end if;

    if nullif(ingredient->>'id', '') is not null then
      update public.gbgs_menu_ingredients
      set inventory_item_id = (ingredient->>'inventory_item_id')::uuid,
          quantity_required = (ingredient->>'quantity_required')::numeric,
          preparation_notes = nullif(ingredient->>'preparation_notes', '')
      where id = (ingredient->>'id')::uuid and meal_id = p_meal_id
      returning id into saved_id;
      if saved_id is null then raise exception 'Recipe ingredient does not belong to this meal'; end if;
    else
      insert into public.gbgs_menu_ingredients (
        meal_id, inventory_item_id, quantity_required, preparation_notes
      ) values (
        p_meal_id,
        (ingredient->>'inventory_item_id')::uuid,
        (ingredient->>'quantity_required')::numeric,
        nullif(ingredient->>'preparation_notes', '')
      ) returning id into saved_id;
    end if;
    retained_ids := array_append(retained_ids, saved_id);
    saved_id := null;
  end loop;

  delete from public.gbgs_menu_ingredients
  where meal_id = p_meal_id and not (id = any(retained_ids));
end;
$$;

alter table public.gbgs_menu_ingredients
  alter column inventory_item_id set not null;

create unique index if not exists gbgs_menu_ingredients_meal_inventory_unique
  on public.gbgs_menu_ingredients(meal_id, inventory_item_id);

alter table public.gbgs_menu_ingredients
  drop column if exists ingredient_name,
  drop column if exists unit;

create index if not exists gbgs_inventory_items_active_name_idx
  on public.gbgs_inventory_items(business_id, is_active, name);
