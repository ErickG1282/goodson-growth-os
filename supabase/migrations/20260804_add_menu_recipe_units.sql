alter table public.gbgs_menu_ingredients
  add column if not exists recipe_unit text;

update public.gbgs_menu_ingredients recipe
set recipe_unit = inventory.unit
from public.gbgs_inventory_items inventory
where inventory.id = recipe.inventory_item_id
  and recipe.recipe_unit is null;

alter table public.gbgs_menu_ingredients
  alter column recipe_unit set default 'each',
  alter column recipe_unit set not null;

alter table public.gbgs_menu_ingredients
  drop constraint if exists gbgs_menu_ingredients_recipe_unit_check;

alter table public.gbgs_menu_ingredients
  add constraint gbgs_menu_ingredients_recipe_unit_check
  check (recipe_unit in ('g', 'kg', 'oz', 'lb', 'tsp', 'tbsp', 'cup', 'ml', 'L', 'each', 'slice', 'piece', 'package'));

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
  if not exists (select 1 from public.gbgs_menu_meals where id = p_meal_id and business_id = p_business_id) then
    raise exception 'Meal does not belong to this business';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb)) value
    group by value->>'inventory_item_id' having count(*) > 1
  ) then raise exception 'Each ingredient can only be added once per recipe'; end if;

  for ingredient in select value from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb))
  loop
    if not exists (
      select 1 from public.gbgs_inventory_items
      where id = (ingredient->>'inventory_item_id')::uuid and business_id = p_business_id
    ) then raise exception 'Selected ingredient does not belong to this business'; end if;

    if nullif(ingredient->>'id', '') is not null then
      update public.gbgs_menu_ingredients
      set inventory_item_id = (ingredient->>'inventory_item_id')::uuid,
          quantity_required = (ingredient->>'quantity_required')::numeric,
          recipe_unit = ingredient->>'recipe_unit',
          preparation_notes = nullif(ingredient->>'preparation_notes', '')
      where id = (ingredient->>'id')::uuid and meal_id = p_meal_id
      returning id into saved_id;
      if saved_id is null then raise exception 'Recipe ingredient does not belong to this meal'; end if;
    else
      insert into public.gbgs_menu_ingredients (
        meal_id, inventory_item_id, quantity_required, recipe_unit, preparation_notes
      ) values (
        p_meal_id, (ingredient->>'inventory_item_id')::uuid,
        (ingredient->>'quantity_required')::numeric, ingredient->>'recipe_unit',
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
