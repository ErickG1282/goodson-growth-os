alter table public.gbgs_orders
  add column if not exists meal_id uuid references public.gbgs_menu_meals(id) on delete restrict;

alter table public.gbgs_menu_ingredients
  add column if not exists inventory_item_id uuid references public.gbgs_inventory_items(id) on delete restrict;

create index if not exists gbgs_orders_meal_id_idx on public.gbgs_orders(meal_id);
create index if not exists gbgs_menu_ingredients_inventory_item_id_idx
  on public.gbgs_menu_ingredients(inventory_item_id);

create or replace function public.gbgs_validate_order_meal_business()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.meal_id is not null and not exists (
    select 1 from public.gbgs_menu_meals
    where id = new.meal_id and business_id = new.business_id
  ) then raise exception 'Order meal must belong to the same business'; end if;
  return new;
end;
$$;

drop trigger if exists gbgs_orders_validate_meal_business on public.gbgs_orders;
create trigger gbgs_orders_validate_meal_business
before insert or update of meal_id, business_id on public.gbgs_orders
for each row execute function public.gbgs_validate_order_meal_business();

create or replace function public.gbgs_validate_recipe_inventory_business()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.inventory_item_id is not null and not exists (
    select 1
    from public.gbgs_menu_meals meal
    join public.gbgs_inventory_items inventory
      on inventory.business_id = meal.business_id
    where meal.id = new.meal_id and inventory.id = new.inventory_item_id
  ) then raise exception 'Recipe inventory item must belong to the meal business'; end if;
  return new;
end;
$$;

drop trigger if exists gbgs_menu_ingredients_validate_inventory_business on public.gbgs_menu_ingredients;
create trigger gbgs_menu_ingredients_validate_inventory_business
before insert or update of meal_id, inventory_item_id on public.gbgs_menu_ingredients
for each row execute function public.gbgs_validate_recipe_inventory_business();

-- Migrate legacy relationships once. Application code no longer reads these names.
update public.gbgs_orders o
set meal_id = m.id
from public.gbgs_menu_meals m
where o.meal_id is null
  and m.business_id = o.business_id
  and lower(m.name) = lower(nullif(substring(o.notes from '(?im)^Meal Plan:\s*(.+)$'), ''));

update public.gbgs_menu_ingredients i
set inventory_item_id = inventory.id
from public.gbgs_menu_meals meal
join public.gbgs_inventory_items inventory
  on inventory.business_id = meal.business_id
where i.meal_id = meal.id
  and i.inventory_item_id is null
  and lower(inventory.name) = lower(i.ingredient_name);

update public.gbgs_production_plans plan
set plan_data = (
  select coalesce(jsonb_agg(
    element || jsonb_build_object('inventoryItemId', inventory.id)
  ), '[]'::jsonb) as plan_data
  from jsonb_array_elements(plan.plan_data) element
  join public.gbgs_inventory_items inventory
    on inventory.business_id = plan.business_id
   and lower(inventory.name) = lower(element->>'name')
)
where jsonb_array_length(plan.plan_data) > 0;

update public.gbgs_production_plans plan
set applied_plan_data = (
  select coalesce(jsonb_agg(
    element || jsonb_build_object('inventoryItemId', inventory.id)
  ), '[]'::jsonb) as plan_data
  from jsonb_array_elements(plan.applied_plan_data) element
  join public.gbgs_inventory_items inventory
    on inventory.business_id = plan.business_id
   and lower(inventory.name) = lower(element->>'name')
)
where jsonb_array_length(plan.applied_plan_data) > 0;

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

  for ingredient in select value from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb))
  loop
    if not exists (
      select 1 from public.gbgs_inventory_items
      where id = (ingredient->>'inventory_item_id')::uuid
        and business_id = p_business_id
    ) then
      raise exception 'Ingredient inventory item does not belong to this business';
    end if;

    if nullif(ingredient->>'id', '') is not null then
      update public.gbgs_menu_ingredients
      set inventory_item_id = (ingredient->>'inventory_item_id')::uuid,
          ingredient_name = ingredient->>'ingredient_name',
          quantity_required = (ingredient->>'quantity_required')::numeric,
          unit = ingredient->>'unit'
      where id = (ingredient->>'id')::uuid and meal_id = p_meal_id
      returning id into saved_id;
      if saved_id is null then raise exception 'Recipe ingredient does not belong to this meal'; end if;
    else
      insert into public.gbgs_menu_ingredients (
        meal_id, inventory_item_id, ingredient_name, quantity_required, unit
      ) values (
        p_meal_id,
        (ingredient->>'inventory_item_id')::uuid,
        ingredient->>'ingredient_name',
        (ingredient->>'quantity_required')::numeric,
        ingredient->>'unit'
      ) returning id into saved_id;
    end if;
    retained_ids := array_append(retained_ids, saved_id);
    saved_id := null;
  end loop;

  delete from public.gbgs_menu_ingredients
  where meal_id = p_meal_id and not (id = any(retained_ids));
end;
$$;

create or replace function public.gbgs_save_meal(
  p_business_id uuid,
  p_meal_id uuid,
  p_values jsonb,
  p_ingredients jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved_id uuid;
begin
  if p_meal_id is null then
    insert into public.gbgs_menu_meals (
      business_id, name, description, photo_url, category, serving_size,
      calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg,
      selling_price, food_cost, cooking_instructions, packaging_instructions,
      heating_instructions, customer_notes, status
    ) values (
      p_business_id, p_values->>'name', nullif(p_values->>'description', ''),
      nullif(p_values->>'photo_url', ''), p_values->>'category',
      nullif(p_values->>'serving_size', ''), (p_values->>'calories')::numeric,
      (p_values->>'protein_g')::numeric, (p_values->>'carbs_g')::numeric,
      (p_values->>'fat_g')::numeric, (p_values->>'fiber_g')::numeric,
      (p_values->>'sugar_g')::numeric, (p_values->>'sodium_mg')::numeric,
      (p_values->>'selling_price')::numeric, (p_values->>'food_cost')::numeric,
      nullif(p_values->>'cooking_instructions', ''),
      nullif(p_values->>'packaging_instructions', ''),
      nullif(p_values->>'heating_instructions', ''),
      nullif(p_values->>'customer_notes', ''), p_values->>'status'
    ) returning id into saved_id;
  else
    update public.gbgs_menu_meals set
      name = p_values->>'name', description = nullif(p_values->>'description', ''),
      photo_url = nullif(p_values->>'photo_url', ''), category = p_values->>'category',
      serving_size = nullif(p_values->>'serving_size', ''),
      calories = (p_values->>'calories')::numeric,
      protein_g = (p_values->>'protein_g')::numeric,
      carbs_g = (p_values->>'carbs_g')::numeric,
      fat_g = (p_values->>'fat_g')::numeric,
      fiber_g = (p_values->>'fiber_g')::numeric,
      sugar_g = (p_values->>'sugar_g')::numeric,
      sodium_mg = (p_values->>'sodium_mg')::numeric,
      selling_price = (p_values->>'selling_price')::numeric,
      food_cost = (p_values->>'food_cost')::numeric,
      cooking_instructions = nullif(p_values->>'cooking_instructions', ''),
      packaging_instructions = nullif(p_values->>'packaging_instructions', ''),
      heating_instructions = nullif(p_values->>'heating_instructions', ''),
      customer_notes = nullif(p_values->>'customer_notes', ''),
      status = p_values->>'status', updated_at = now()
    where id = p_meal_id and business_id = p_business_id
    returning id into saved_id;
    if saved_id is null then raise exception 'Meal does not belong to this business'; end if;
  end if;
  perform public.gbgs_replace_meal_recipe(p_business_id, saved_id, p_ingredients);
  return saved_id;
end;
$$;

create or replace function public.gbgs_receive_inventory(
  p_business_id uuid,
  p_inventory_item_id uuid,
  p_quantity numeric,
  p_reason text default 'Inventory received'
)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  item public.gbgs_inventory_items%rowtype;
begin
  if p_quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  update public.gbgs_inventory_items
  set quantity = quantity + p_quantity, updated_at = now()
  where id = p_inventory_item_id and business_id = p_business_id
  returning * into item;
  if item.id is null then raise exception 'Inventory item does not belong to this business'; end if;
  insert into public.gbgs_inventory_history (
    business_id, inventory_item_id, ingredient, quantity_change, unit, reason
  ) values (
    p_business_id, item.id, item.name, p_quantity, item.unit, p_reason
  );
  return item.quantity;
end;
$$;

create or replace function public.gbgs_apply_production_plan(
  p_business_id uuid,
  p_plan_data jsonb,
  p_summary jsonb,
  p_inventory_changes jsonb,
  p_order_ids uuid[],
  p_order_status text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  change jsonb;
  item public.gbgs_inventory_items%rowtype;
  target_id uuid;
begin
  for change in select value from jsonb_array_elements(coalesce(p_inventory_changes, '[]'::jsonb))
  loop
    target_id := (change->>'id')::uuid;
    update public.gbgs_inventory_items
    set quantity = quantity + (change->>'quantity_change')::numeric,
        updated_at = now()
    where id = target_id
      and business_id = p_business_id
      and quantity + (change->>'quantity_change')::numeric >= 0
    returning * into item;
    if item.id is null then raise exception 'Invalid or insufficient inventory for item %', target_id; end if;
    insert into public.gbgs_inventory_history (
      business_id, inventory_item_id, ingredient, quantity_change, unit, reason
    ) values (
      p_business_id, item.id, item.name,
      (change->>'quantity_change')::numeric, item.unit, 'Production use'
    );
    item := null;
  end loop;

  insert into public.gbgs_production_plans (
    business_id, plan_data, applied_plan_data, summary, updated_at
  ) values (
    p_business_id, p_plan_data, p_plan_data, p_summary, now()
  )
  on conflict (business_id) do update
  set plan_data = excluded.plan_data,
      applied_plan_data = excluded.applied_plan_data,
      summary = excluded.summary,
      updated_at = excluded.updated_at;

  if p_order_status is not null and coalesce(array_length(p_order_ids, 1), 0) > 0 then
    update public.gbgs_orders
    set order_status = p_order_status
    where business_id = p_business_id and id = any(p_order_ids);
    if found then
      insert into public.gbgs_order_workflow_events (business_id, order_id, status, label)
      select p_business_id, id, p_order_status,
        case when p_order_status = 'Packaging' then 'Order moved to Packaging' else 'Kitchen Started' end
      from public.gbgs_orders
      where business_id = p_business_id and id = any(p_order_ids);
    end if;
  end if;
end;
$$;

create or replace function public.gbgs_transition_order(
  p_business_id uuid,
  p_order_id uuid,
  p_order_status text,
  p_label text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.gbgs_orders
    where id = p_order_id and business_id = p_business_id
  ) then raise exception 'Order does not belong to this business'; end if;

  update public.gbgs_orders set order_status = p_order_status where id = p_order_id;
  insert into public.gbgs_order_workflow_events (business_id, order_id, status, label)
  values (p_business_id, p_order_id, p_order_status, p_label);
end;
$$;

create or replace function public.gbgs_create_order(
  p_business_id uuid,
  p_created_by uuid,
  p_customer_id uuid,
  p_meal_id uuid,
  p_values jsonb,
  p_payment_amount numeric default 0
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved public.gbgs_orders%rowtype;
begin
  if not exists (select 1 from public.gbgs_customers where id = p_customer_id and business_id = p_business_id)
    then raise exception 'Customer does not belong to this business'; end if;
  if not exists (select 1 from public.gbgs_menu_meals where id = p_meal_id and business_id = p_business_id)
    then raise exception 'Meal does not belong to this business'; end if;

  insert into public.gbgs_orders (
    business_id, created_by, customer_id, meal_id, order_number, order_date,
    fulfillment_date, order_status, payment_status, delivery_method, subtotal,
    delivery_fee, discount, amount_paid, total, balance_due, notes
  ) values (
    p_business_id, p_created_by, p_customer_id, p_meal_id,
    p_values->>'order_number', (p_values->>'order_date')::date,
    nullif(p_values->>'fulfillment_date', '')::date, p_values->>'order_status',
    p_values->>'payment_status', p_values->>'delivery_method',
    (p_values->>'subtotal')::numeric, (p_values->>'delivery_fee')::numeric,
    (p_values->>'discount')::numeric, 0, (p_values->>'total')::numeric,
    (p_values->>'total')::numeric, nullif(p_values->>'notes', '')
  ) returning * into saved;

  insert into public.gbgs_order_workflow_events (business_id, order_id, status, label)
  values (p_business_id, saved.id, saved.order_status, 'Order Created');

  if p_payment_amount > 0 then
    insert into public.gbgs_payments (
      business_id, order_id, customer_id, invoice_number, payment_method,
      amount, internal_notes
    ) values (
      p_business_id, saved.id, p_customer_id, 'INV-' || saved.order_number,
      'Cash', p_payment_amount, 'Opening payment recorded with order'
    );
    insert into public.gbgs_order_workflow_events (business_id, order_id, status, label)
    values (p_business_id, saved.id, 'Paid', 'Payment Received');
  end if;
  return saved.id;
end;
$$;

create or replace function public.gbgs_update_order_and_payment(
  p_business_id uuid,
  p_order_id uuid,
  p_meal_id uuid,
  p_values jsonb,
  p_target_paid numeric
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved public.gbgs_orders%rowtype;
  current_paid numeric;
  delta numeric;
  payment public.gbgs_payments%rowtype;
  refund_amount numeric;
begin
  if not exists (select 1 from public.gbgs_menu_meals where id = p_meal_id and business_id = p_business_id)
    then raise exception 'Meal does not belong to this business'; end if;
  update public.gbgs_orders set
    meal_id = p_meal_id,
    fulfillment_date = nullif(p_values->>'fulfillment_date', '')::date,
    delivery_method = p_values->>'delivery_method',
    subtotal = (p_values->>'subtotal')::numeric,
    delivery_fee = (p_values->>'delivery_fee')::numeric,
    discount = (p_values->>'discount')::numeric,
    total = (p_values->>'total')::numeric,
    notes = nullif(p_values->>'notes', '')
  where id = p_order_id and business_id = p_business_id
  returning * into saved;
  if saved.id is null then raise exception 'Order does not belong to this business'; end if;

  select coalesce(sum(case when status = 'Refunded' then -amount else amount end), 0)
  into current_paid from public.gbgs_payments where order_id = p_order_id;
  delta := greatest(0, p_target_paid) - greatest(0, current_paid);
  if delta > 0.001 then
    insert into public.gbgs_payments (
      business_id, order_id, customer_id, invoice_number, payment_method, amount, internal_notes
    ) values (
      p_business_id, p_order_id, saved.customer_id, 'INV-' || saved.order_number,
      'Cash', delta, 'Payment adjustment from Orders HQ'
    );
  elsif delta < -0.001 then
    delta := abs(delta);
    for payment in
      select * from public.gbgs_payments
      where order_id = p_order_id and status = 'Completed'
      order by payment_date desc
    loop
      exit when delta <= 0.001;
      refund_amount := least(delta, payment.amount);
      insert into public.gbgs_payments (
        business_id, order_id, customer_id, invoice_number, payment_method,
        amount, status, parent_payment_id, internal_notes
      ) values (
        p_business_id, p_order_id, saved.customer_id, 'INV-' || saved.order_number,
        payment.payment_method, refund_amount, 'Refunded', payment.id,
        'Payment adjustment from Orders HQ'
      );
      delta := delta - refund_amount;
    end loop;
    if delta > 0.001 then raise exception 'Refund exceeds completed payments'; end if;
  else
    update public.gbgs_orders set
      balance_due = greatest(0, total - p_target_paid),
      amount_paid = greatest(0, p_target_paid),
      payment_status = case when p_target_paid <= 0 then 'Unpaid' when p_target_paid >= total then 'Paid' else 'Partial' end
    where id = p_order_id;
  end if;
end;
$$;

revoke all on function public.gbgs_replace_meal_recipe(uuid, uuid, jsonb) from public;
revoke all on function public.gbgs_save_meal(uuid, uuid, jsonb, jsonb) from public;
revoke all on function public.gbgs_receive_inventory(uuid, uuid, numeric, text) from public;
revoke all on function public.gbgs_apply_production_plan(uuid, jsonb, jsonb, jsonb, uuid[], text) from public;
revoke all on function public.gbgs_transition_order(uuid, uuid, text, text) from public;
revoke all on function public.gbgs_create_order(uuid, uuid, uuid, uuid, jsonb, numeric) from public;
revoke all on function public.gbgs_update_order_and_payment(uuid, uuid, uuid, jsonb, numeric) from public;
grant execute on function public.gbgs_replace_meal_recipe(uuid, uuid, jsonb) to authenticated;
grant execute on function public.gbgs_save_meal(uuid, uuid, jsonb, jsonb) to authenticated;
grant execute on function public.gbgs_receive_inventory(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.gbgs_apply_production_plan(uuid, jsonb, jsonb, jsonb, uuid[], text) to authenticated;
grant execute on function public.gbgs_transition_order(uuid, uuid, text, text) to authenticated;
grant execute on function public.gbgs_create_order(uuid, uuid, uuid, uuid, jsonb, numeric) to authenticated;
grant execute on function public.gbgs_update_order_and_payment(uuid, uuid, uuid, jsonb, numeric) to authenticated;

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
      payment_status = case when paid_total <= 0 then 'Unpaid' when paid_total >= order_total then 'Paid' else 'Partial' end,
      order_status = case
        when paid_total >= order_total and lower(order_status) in ('pending', 'new order') then 'Paid'
        else order_status
      end
  where id = target_order_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
