-- Reconcile drifted production tables with the current GBGS application contract.
-- This migration is data-preserving and rerunnable. It intentionally retains
-- unknown/legacy columns while adding and validating the objects the app uses.

do $$
declare missing text;
begin
  select string_agg(name, ', ') into missing
  from (values
    ('public.gbgs_businesses'), ('public.gbgs_customers'), ('public.gbgs_menu_meals'),
    ('public.gbgs_orders'), ('public.gbgs_payments'), ('public.gbgs_calendar_events'),
    ('public.gbgs_deliveries'), ('public.gbgs_menu_ingredients'),
    ('public.gbgs_inventory_items'), ('public.gbgs_order_workflow_events'),
    ('public.gbgs_inventory_history'), ('public.gbgs_production_plans')
  ) required(name)
  where to_regclass(name) is null;
  if missing is not null then
    raise exception 'Schema reconciliation requires existing foundational tables: %', missing;
  end if;
end $$;

-- Columns: CREATE TABLE IF NOT EXISTS never reconciles an older table.
alter table public.gbgs_orders
  add column if not exists meal_id uuid,
  add column if not exists meal_count integer,
  add column if not exists fulfillment_date date,
  add column if not exists delivery_method text,
  add column if not exists subtotal numeric(12,2) default 0,
  add column if not exists delivery_fee numeric(12,2) default 0,
  add column if not exists discount numeric(12,2) default 0,
  add column if not exists amount_paid numeric(12,2) default 0,
  add column if not exists total numeric(12,2) default 0,
  add column if not exists balance_due numeric(12,2) default 0,
  add column if not exists payment_status text default 'Unpaid',
  add column if not exists order_status text default 'New Order',
  add column if not exists notes text;

alter table public.gbgs_payments
  add column if not exists record_type text,
  add column if not exists amount_due numeric(12,2),
  add column if not exists balance numeric(12,2),
  add column if not exists updated_at timestamptz default now();

alter table public.gbgs_deliveries
  add column if not exists delivery_type text,
  add column if not exists driver_name text,
  add column if not exists driver_phone text,
  add column if not exists completed_at timestamptz,
  add column if not exists address text,
  add column if not exists notes text,
  add column if not exists activity_timeline jsonb default '[]'::jsonb,
  add column if not exists updated_at timestamptz default now();

alter table public.gbgs_menu_ingredients
  add column if not exists inventory_item_id uuid,
  add column if not exists preparation_notes text,
  add column if not exists recipe_unit text default 'each';

alter table public.gbgs_inventory_items
  add column if not exists is_active boolean default true,
  add column if not exists updated_at timestamptz default now();

-- Backfills/defaults. Existing rows remain in place.
update public.gbgs_orders
set meal_count = greatest(1, coalesce(
  (regexp_match(coalesce(notes, ''), '(?im)^Number of Meals:\s*([0-9]+)\s*$'))[1]::integer, 1))
where meal_count is null;
update public.gbgs_orders set amount_paid = 0 where amount_paid is null;
update public.gbgs_orders set total = 0 where total is null;
update public.gbgs_orders set balance_due = greatest(0, total - amount_paid) where balance_due is null;
update public.gbgs_orders set payment_status = 'Unpaid' where payment_status is null;
update public.gbgs_orders set order_status = 'New Order' where order_status is null;


update public.gbgs_payments set record_type = 'Transaction' where record_type is null;
update public.gbgs_payments set amount_due = 0 where amount_due is null;
update public.gbgs_payments set balance = 0 where balance is null;

update public.gbgs_deliveries d set
  delivery_type=case when lower(coalesce(o.delivery_method,'pickup'))='delivery' then 'Delivery' else 'Pickup' end,
  status=case lower(coalesce(o.order_status,'new order')) when 'cancelled' then 'Cancelled' when 'canceled' then 'Cancelled' when 'completed' then 'Delivered' when 'delivered' then 'Delivered' when 'out for delivery' then 'Out For Delivery' when 'ready for pickup' then 'Ready' when 'ready' then 'Ready' when 'packaging' then 'Packaging' when 'kitchen' then 'Preparing' when 'cooking' then 'Preparing' when 'preparing' then 'Preparing' else 'New Order' end
from public.gbgs_orders o where o.id=d.order_id
  and (d.delivery_type is null or d.status is null or d.status not in('New Order','Preparing','Packaging','Ready','Out For Delivery','Delivered','Cancelled'));
update public.gbgs_deliveries set activity_timeline = '[]'::jsonb where activity_timeline is null;

update public.gbgs_inventory_items set is_active = true where is_active is null;
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='gbgs_menu_ingredients' and column_name='ingredient_name') then
    execute 'update public.gbgs_menu_ingredients recipe set inventory_item_id=inventory.id from public.gbgs_menu_meals meal join public.gbgs_inventory_items inventory on inventory.business_id=meal.business_id where recipe.meal_id=meal.id and recipe.inventory_item_id is null and lower(inventory.name)=lower(recipe.ingredient_name)';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='gbgs_inventory_items' and column_name='unit') then
    execute 'update public.gbgs_menu_ingredients recipe set recipe_unit=coalesce(inventory.unit,''each'') from public.gbgs_inventory_items inventory where inventory.id=recipe.inventory_item_id and recipe.recipe_unit is null';
  end if;
end $$;
update public.gbgs_menu_ingredients set recipe_unit = 'each' where recipe_unit is null;

alter table public.gbgs_orders alter column meal_count set default 1;
alter table public.gbgs_orders alter column meal_count set not null;
alter table public.gbgs_payments alter column record_type set default 'Transaction';
alter table public.gbgs_payments alter column record_type set not null;
alter table public.gbgs_payments alter column amount_due set default 0;
alter table public.gbgs_payments alter column amount_due set not null;
alter table public.gbgs_payments alter column balance set default 0;
alter table public.gbgs_payments alter column balance set not null;
alter table public.gbgs_payments alter column amount set default 0;
alter table public.gbgs_deliveries alter column delivery_type set not null;
alter table public.gbgs_deliveries alter column activity_timeline set default '[]'::jsonb;
alter table public.gbgs_deliveries alter column activity_timeline set not null;
alter table public.gbgs_inventory_items alter column is_active set default true;
alter table public.gbgs_inventory_items alter column is_active set not null;
alter table public.gbgs_menu_ingredients alter column recipe_unit set default 'each';
alter table public.gbgs_menu_ingredients alter column recipe_unit set not null;

-- Foreign keys, added only when an equivalent relationship is absent.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.gbgs_orders'::regclass and contype='f' and conkey=array[(select attnum from pg_attribute where attrelid='public.gbgs_orders'::regclass and attname='meal_id')]) then
    alter table public.gbgs_orders add constraint gbgs_orders_meal_id_fkey foreign key(meal_id) references public.gbgs_menu_meals(id) on delete restrict not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.gbgs_menu_ingredients'::regclass and contype='f' and conkey=array[(select attnum from pg_attribute where attrelid='public.gbgs_menu_ingredients'::regclass and attname='inventory_item_id')]) then
    alter table public.gbgs_menu_ingredients add constraint gbgs_menu_ingredients_inventory_item_id_fkey foreign key(inventory_item_id) references public.gbgs_inventory_items(id) on delete restrict not valid;
  end if;
end $$;

-- Current checks replace incompatible legacy checks after values are normalized.
alter table public.gbgs_orders drop constraint if exists gbgs_orders_meal_count_check;
alter table public.gbgs_orders add constraint gbgs_orders_meal_count_check check (meal_count > 0);
alter table public.gbgs_payments drop constraint if exists gbgs_payments_amount_check;
alter table public.gbgs_payments drop constraint if exists gbgs_payments_status_check;
alter table public.gbgs_payments drop constraint if exists gbgs_payments_record_type_check;
alter table public.gbgs_payments add constraint gbgs_payments_amount_check check (amount >= 0);
alter table public.gbgs_payments add constraint gbgs_payments_status_check check (status in ('Unpaid','Partially Paid','Paid','Completed','Refunded'));
alter table public.gbgs_payments add constraint gbgs_payments_record_type_check check (record_type in ('Order Summary','Transaction'));
alter table public.gbgs_deliveries drop constraint if exists gbgs_deliveries_delivery_type_check;
alter table public.gbgs_deliveries drop constraint if exists gbgs_deliveries_status_check;
alter table public.gbgs_deliveries add constraint gbgs_deliveries_delivery_type_check check (delivery_type in ('Pickup','Delivery'));
alter table public.gbgs_deliveries add constraint gbgs_deliveries_status_check check (status in ('New Order','Preparing','Packaging','Ready','Out For Delivery','Delivered','Cancelled'));
alter table public.gbgs_menu_ingredients drop constraint if exists gbgs_menu_ingredients_recipe_unit_check;
alter table public.gbgs_menu_ingredients add constraint gbgs_menu_ingredients_recipe_unit_check check (recipe_unit in ('g','kg','oz','lb','tsp','tbsp','cup','ml','L','each','slice','piece','package'));

-- Required indexes.
create index if not exists gbgs_orders_meal_id_idx on public.gbgs_orders(meal_id);
create index if not exists gbgs_payments_business_id_idx on public.gbgs_payments(business_id);
create index if not exists gbgs_payments_order_id_idx on public.gbgs_payments(order_id);
create index if not exists gbgs_payments_customer_id_idx on public.gbgs_payments(customer_id);
create index if not exists gbgs_payments_payment_date_idx on public.gbgs_payments(payment_date);
create unique index if not exists gbgs_payments_order_summary_idx on public.gbgs_payments(order_id) where record_type='Order Summary';
create unique index if not exists gbgs_deliveries_order_id_idx on public.gbgs_deliveries(order_id);
create index if not exists gbgs_deliveries_business_id_idx on public.gbgs_deliveries(business_id);
create index if not exists gbgs_deliveries_business_schedule_idx on public.gbgs_deliveries(business_id,scheduled_at);
create index if not exists gbgs_deliveries_business_status_idx on public.gbgs_deliveries(business_id,status);
create index if not exists gbgs_menu_ingredients_meal_id_idx on public.gbgs_menu_ingredients(meal_id);
create index if not exists gbgs_menu_ingredients_inventory_item_id_idx on public.gbgs_menu_ingredients(inventory_item_id);
create unique index if not exists gbgs_menu_ingredients_meal_inventory_unique on public.gbgs_menu_ingredients(meal_id,inventory_item_id) where inventory_item_id is not null;
create index if not exists gbgs_inventory_items_business_idx on public.gbgs_inventory_items(business_id);
create index if not exists gbgs_inventory_items_active_name_idx on public.gbgs_inventory_items(business_id,is_active,name);

-- Canonical synchronization functions.
create or replace function public.gbgs_payment_summary_status(p_status text)
returns text language sql immutable set search_path=public as $$
select case lower(coalesce(p_status,'unpaid')) when 'paid' then 'Paid' when 'partial' then 'Partially Paid' when 'partially paid' then 'Partially Paid' when 'refunded' then 'Refunded' else 'Unpaid' end
$$;

create or replace function public.gbgs_sync_order_payment_summary()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.gbgs_payments(business_id,order_id,customer_id,invoice_number,payment_method,amount,amount_due,balance,status,record_type,internal_notes)
  values(new.business_id,new.id,new.customer_id,'INV-'||new.order_number,'Cash',coalesce(new.amount_paid,0),coalesce(new.total,0),coalesce(new.balance_due,new.total,0),public.gbgs_payment_summary_status(new.payment_status),'Order Summary','Automatically synchronized from order')
  on conflict(order_id) where record_type='Order Summary' do update set business_id=excluded.business_id,customer_id=excluded.customer_id,invoice_number=excluded.invoice_number,amount=excluded.amount,amount_due=excluded.amount_due,balance=excluded.balance,status=excluded.status,updated_at=now();
  return new;
end $$;

create or replace function public.gbgs_recalculate_order_payment()
returns trigger language plpgsql security definer set search_path=public as $$
declare target uuid; targets uuid[]; paid numeric(12,2); total_due numeric(12,2);
begin
  targets:=case when tg_op='DELETE' then array[old.order_id] when tg_op='UPDATE' and old.order_id is distinct from new.order_id then array[old.order_id,new.order_id] else array[new.order_id] end;
  foreach target in array targets loop
    select total into total_due from public.gbgs_orders where id=target; if not found then continue; end if;
    select greatest(0,coalesce(sum(case when status='Refunded' then -amount else amount end),0))::numeric(12,2) into paid from public.gbgs_payments where order_id=target and record_type='Transaction';
    update public.gbgs_orders set amount_paid=paid,balance_due=greatest(0,total_due-paid),payment_status=case when paid<=0 then 'Unpaid' when paid>=total_due then 'Paid' else 'Partial' end where id=target and (amount_paid,balance_due,payment_status) is distinct from (paid,greatest(0,total_due-paid),case when paid<=0 then 'Unpaid' when paid>=total_due then 'Paid' else 'Partial' end);
  end loop;
  return case when tg_op='DELETE' then old else new end;
end $$;

create or replace function public.gbgs_delivery_status(p_order_status text)
returns text language sql immutable as $$
select case lower(coalesce(p_order_status,'new order')) when 'cancelled' then 'Cancelled' when 'canceled' then 'Cancelled' when 'completed' then 'Delivered' when 'delivered' then 'Delivered' when 'out for delivery' then 'Out For Delivery' when 'ready for pickup' then 'Ready' when 'ready' then 'Ready' when 'packaging' then 'Packaging' when 'kitchen' then 'Preparing' when 'cooking' then 'Preparing' when 'preparing' then 'Preparing' else 'New Order' end
$$;

create or replace function public.gbgs_sync_order_delivery()
returns trigger language plpgsql security definer set search_path=public as $$
declare next_status text:=public.gbgs_delivery_status(new.order_status); next_type text:=case when lower(coalesce(new.delivery_method,'pickup'))='delivery' then 'Delivery' else 'Pickup' end; next_address text:=nullif(substring(coalesce(new.notes,'') from '(?im)^Delivery Address:\s*(.+)$'),'');
begin
  insert into public.gbgs_deliveries(business_id,order_id,delivery_type,status,scheduled_at,completed_at,address,notes,activity_timeline)
  values(new.business_id,new.id,next_type,next_status,case when new.fulfillment_date is null then null else new.fulfillment_date::date+time '12:00' end,case when next_status='Delivered' then now() end,next_address,new.notes,jsonb_build_array(jsonb_build_object('status','Created','timestamp',now())))
  on conflict(order_id) do update set business_id=excluded.business_id,delivery_type=excluded.delivery_type,scheduled_at=excluded.scheduled_at,address=excluded.address,notes=excluded.notes,status=excluded.status,completed_at=case when excluded.status='Delivered' then coalesce(public.gbgs_deliveries.completed_at,now()) else null end,activity_timeline=case when public.gbgs_deliveries.status is distinct from excluded.status then coalesce(public.gbgs_deliveries.activity_timeline,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('status',excluded.status,'timestamp',now())) else public.gbgs_deliveries.activity_timeline end,updated_at=now();
  return new;
end $$;

create or replace function public.gbgs_sync_order_calendar_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare event_user_id uuid;
begin
  if new.fulfillment_date is null then delete from public.gbgs_calendar_events where source='Order' and source_id=new.id; return new; end if;
  event_user_id:=coalesce(new.created_by,(select member.user_id from public.gbgs_business_members member where member.business_id=new.business_id order by case lower(coalesce(member.role,'')) when 'owner' then 0 when 'admin' then 1 else 2 end,member.created_at,member.id limit 1));
  if event_user_id is null then raise exception 'Cannot create fulfillment calendar event: order has no creator and business has no member'; end if;
  update public.gbgs_calendar_events set user_id=event_user_id,title=coalesce(new.delivery_method,'Pickup')||' - '||new.order_number,event_date=new.fulfillment_date,start_time=time '12:00',end_time=null,location=null,notes=new.notes,completed=lower(new.order_status) in('completed','delivered'),category='Fulfillment',updated_at=now() where source='Order' and source_id=new.id;
  if not found then insert into public.gbgs_calendar_events(user_id,title,event_date,start_time,end_time,location,notes,completed,source,source_id,category) values(event_user_id,coalesce(new.delivery_method,'Pickup')||' - '||new.order_number,new.fulfillment_date,time '12:00',null,null,new.notes,lower(new.order_status) in('completed','delivered'),'Order',new.id,'Fulfillment'); end if;
  return new;
end $$;

create or replace function public.gbgs_validate_order_meal_business()
returns trigger language plpgsql set search_path=public as $$ begin if new.meal_id is not null and not exists(select 1 from public.gbgs_menu_meals where id=new.meal_id and business_id=new.business_id) then raise exception 'Order meal must belong to the same business'; end if; return new; end $$;
create or replace function public.gbgs_validate_recipe_inventory_business()
returns trigger language plpgsql set search_path=public as $$ begin if new.inventory_item_id is not null and not exists(select 1 from public.gbgs_menu_meals m join public.gbgs_inventory_items i on i.business_id=m.business_id where m.id=new.meal_id and i.id=new.inventory_item_id) then raise exception 'Recipe inventory item must belong to the meal business'; end if; return new; end $$;

create or replace function public.gbgs_replace_meal_recipe(p_business_id uuid,p_meal_id uuid,p_ingredients jsonb)
returns void language plpgsql security invoker set search_path=public as $$
declare ingredient jsonb; retained_ids uuid[]:='{}'; saved_id uuid;
begin
  if not exists(select 1 from public.gbgs_menu_meals where id=p_meal_id and business_id=p_business_id) then raise exception 'Meal does not belong to this business'; end if;
  if exists(select 1 from jsonb_array_elements(coalesce(p_ingredients,'[]'::jsonb)) value group by value->>'inventory_item_id' having count(*)>1) then raise exception 'Each ingredient can only be added once per recipe'; end if;
  for ingredient in select value from jsonb_array_elements(coalesce(p_ingredients,'[]'::jsonb)) loop
    if not exists(select 1 from public.gbgs_inventory_items where id=(ingredient->>'inventory_item_id')::uuid and business_id=p_business_id and is_active) then raise exception 'Selected ingredient is not an active inventory item for this business'; end if;
    if nullif(ingredient->>'id','') is not null then
      update public.gbgs_menu_ingredients set inventory_item_id=(ingredient->>'inventory_item_id')::uuid,quantity_required=(ingredient->>'quantity_required')::numeric,recipe_unit=ingredient->>'recipe_unit',preparation_notes=nullif(ingredient->>'preparation_notes','') where id=(ingredient->>'id')::uuid and meal_id=p_meal_id returning id into saved_id;
      if saved_id is null then raise exception 'Recipe ingredient does not belong to this meal'; end if;
    else
      insert into public.gbgs_menu_ingredients(meal_id,inventory_item_id,quantity_required,recipe_unit,preparation_notes) values(p_meal_id,(ingredient->>'inventory_item_id')::uuid,(ingredient->>'quantity_required')::numeric,ingredient->>'recipe_unit',nullif(ingredient->>'preparation_notes','')) returning id into saved_id;
    end if;
    retained_ids:=array_append(retained_ids,saved_id); saved_id:=null;
  end loop;
  delete from public.gbgs_menu_ingredients where meal_id=p_meal_id and not(id=any(retained_ids));
end $$;

create or replace function public.gbgs_receive_inventory(p_business_id uuid,p_inventory_item_id uuid,p_quantity numeric,p_reason text default 'Inventory received')
returns numeric language plpgsql security invoker set search_path=public as $$
declare item public.gbgs_inventory_items%rowtype;
begin
  if p_quantity<=0 then raise exception 'Quantity must be greater than zero'; end if;
  update public.gbgs_inventory_items set quantity=quantity+p_quantity,updated_at=now() where id=p_inventory_item_id and business_id=p_business_id returning * into item;
  if item.id is null then raise exception 'Inventory item does not belong to this business'; end if;
  insert into public.gbgs_inventory_history(business_id,inventory_item_id,ingredient,quantity_change,unit,reason) values(p_business_id,item.id,item.name,p_quantity,item.unit,p_reason);
  return item.quantity;
end $$;

create or replace function public.gbgs_save_meal(p_business_id uuid,p_meal_id uuid,p_values jsonb,p_ingredients jsonb)
returns uuid language plpgsql security invoker set search_path=public as $$
declare saved_id uuid;
begin
  if p_meal_id is null then
    insert into public.gbgs_menu_meals(business_id,name,description,photo_url,category,serving_size,calories,protein_g,carbs_g,fat_g,fiber_g,sugar_g,sodium_mg,selling_price,food_cost,cooking_instructions,packaging_instructions,heating_instructions,customer_notes,status)
    values(p_business_id,p_values->>'name',nullif(p_values->>'description',''),nullif(p_values->>'photo_url',''),p_values->>'category',nullif(p_values->>'serving_size',''),(p_values->>'calories')::numeric,(p_values->>'protein_g')::numeric,(p_values->>'carbs_g')::numeric,(p_values->>'fat_g')::numeric,(p_values->>'fiber_g')::numeric,(p_values->>'sugar_g')::numeric,(p_values->>'sodium_mg')::numeric,(p_values->>'selling_price')::numeric,(p_values->>'food_cost')::numeric,nullif(p_values->>'cooking_instructions',''),nullif(p_values->>'packaging_instructions',''),nullif(p_values->>'heating_instructions',''),nullif(p_values->>'customer_notes',''),p_values->>'status') returning id into saved_id;
  else
    update public.gbgs_menu_meals set name=p_values->>'name',description=nullif(p_values->>'description',''),photo_url=nullif(p_values->>'photo_url',''),category=p_values->>'category',serving_size=nullif(p_values->>'serving_size',''),calories=(p_values->>'calories')::numeric,protein_g=(p_values->>'protein_g')::numeric,carbs_g=(p_values->>'carbs_g')::numeric,fat_g=(p_values->>'fat_g')::numeric,fiber_g=(p_values->>'fiber_g')::numeric,sugar_g=(p_values->>'sugar_g')::numeric,sodium_mg=(p_values->>'sodium_mg')::numeric,selling_price=(p_values->>'selling_price')::numeric,food_cost=(p_values->>'food_cost')::numeric,cooking_instructions=nullif(p_values->>'cooking_instructions',''),packaging_instructions=nullif(p_values->>'packaging_instructions',''),heating_instructions=nullif(p_values->>'heating_instructions',''),customer_notes=nullif(p_values->>'customer_notes',''),status=p_values->>'status',updated_at=now() where id=p_meal_id and business_id=p_business_id returning id into saved_id;
    if saved_id is null then raise exception 'Meal does not belong to this business'; end if;
  end if;
  perform public.gbgs_replace_meal_recipe(p_business_id,saved_id,p_ingredients); return saved_id;
end $$;

create or replace function public.gbgs_apply_production_plan(p_business_id uuid,p_plan_data jsonb,p_summary jsonb,p_inventory_changes jsonb,p_order_ids uuid[],p_order_status text)
returns void language plpgsql security invoker set search_path=public as $$
declare change jsonb; item public.gbgs_inventory_items%rowtype; target_id uuid;
begin
  for change in select value from jsonb_array_elements(coalesce(p_inventory_changes,'[]'::jsonb)) loop
    target_id:=(change->>'id')::uuid;
    update public.gbgs_inventory_items set quantity=quantity+(change->>'quantity_change')::numeric,updated_at=now() where id=target_id and business_id=p_business_id and quantity+(change->>'quantity_change')::numeric>=0 returning * into item;
    if item.id is null then raise exception 'Invalid or insufficient inventory for item %',target_id; end if;
    insert into public.gbgs_inventory_history(business_id,inventory_item_id,ingredient,quantity_change,unit,reason) values(p_business_id,item.id,item.name,(change->>'quantity_change')::numeric,item.unit,'Production use'); item:=null;
  end loop;
  insert into public.gbgs_production_plans(business_id,plan_data,applied_plan_data,summary,updated_at) values(p_business_id,p_plan_data,p_plan_data,p_summary,now()) on conflict(business_id) do update set plan_data=excluded.plan_data,applied_plan_data=excluded.applied_plan_data,summary=excluded.summary,updated_at=excluded.updated_at;
  if p_order_status is not null and coalesce(array_length(p_order_ids,1),0)>0 then
    update public.gbgs_orders set order_status=p_order_status where business_id=p_business_id and id=any(p_order_ids);
    insert into public.gbgs_order_workflow_events(business_id,order_id,status,label) select p_business_id,id,p_order_status,case when p_order_status='Packaging' then 'Order moved to Packaging' else 'Kitchen Started' end from public.gbgs_orders where business_id=p_business_id and id=any(p_order_ids);
  end if;
end $$;

create or replace function public.gbgs_transition_order(p_business_id uuid,p_order_id uuid,p_order_status text,p_label text)
returns void language plpgsql security invoker set search_path=public as $$ begin
  update public.gbgs_orders set order_status=p_order_status where id=p_order_id and business_id=p_business_id;
  if not found then raise exception 'Order does not belong to this business'; end if;
  insert into public.gbgs_order_workflow_events(business_id,order_id,status,label) values(p_business_id,p_order_id,p_order_status,p_label);
end $$;

create or replace function public.gbgs_set_order_payment_status(p_business_id uuid,p_order_id uuid,p_payment_status text)
returns void language plpgsql security invoker set search_path=public as $$
declare normalized text:=lower(p_payment_status);
begin
  if normalized not in('unpaid','partial','partially paid','paid','refunded') then raise exception 'Unsupported payment status'; end if;
  update public.gbgs_orders set payment_status=case when normalized='paid' then 'Paid' when normalized in('partial','partially paid') then 'Partial' when normalized='refunded' then 'Refunded' else 'Unpaid' end,amount_paid=case when normalized='paid' then total when normalized in('partial','partially paid') then least(total,greatest(amount_paid,0)) else 0 end,balance_due=case when normalized='paid' then 0 when normalized in('partial','partially paid') then greatest(0,total-greatest(amount_paid,0)) else total end where id=p_order_id and business_id=p_business_id;
  if not found then raise exception 'Order does not belong to this business'; end if;
  insert into public.gbgs_order_workflow_events(business_id,order_id,status,label) values(p_business_id,p_order_id,p_payment_status,'Payment moved to '||p_payment_status);
end $$;

create or replace function public.gbgs_create_order(p_business_id uuid,p_created_by uuid,p_customer_id uuid,p_meal_id uuid,p_values jsonb,p_payment_amount numeric default 0)
returns uuid language plpgsql security invoker set search_path=public as $$
declare saved public.gbgs_orders%rowtype;
begin
  if not exists(select 1 from public.gbgs_customers where id=p_customer_id and business_id=p_business_id) then raise exception 'Customer does not belong to this business'; end if;
  if not exists(select 1 from public.gbgs_menu_meals where id=p_meal_id and business_id=p_business_id) then raise exception 'Meal does not belong to this business'; end if;
  insert into public.gbgs_orders(business_id,created_by,customer_id,meal_id,meal_count,order_number,order_date,fulfillment_date,order_status,payment_status,delivery_method,subtotal,delivery_fee,discount,amount_paid,total,balance_due,notes)
  values(p_business_id,p_created_by,p_customer_id,p_meal_id,greatest(1,coalesce((p_values->>'meal_count')::integer,1)),p_values->>'order_number',(p_values->>'order_date')::date,nullif(p_values->>'fulfillment_date','')::date,p_values->>'order_status',p_values->>'payment_status',p_values->>'delivery_method',(p_values->>'subtotal')::numeric,(p_values->>'delivery_fee')::numeric,(p_values->>'discount')::numeric,0,(p_values->>'total')::numeric,(p_values->>'total')::numeric,nullif(p_values->>'notes','')) returning * into saved;
  insert into public.gbgs_order_workflow_events(business_id,order_id,status,label) values(p_business_id,saved.id,saved.order_status,'Order Created');
  if p_payment_amount>0 then insert into public.gbgs_payments(business_id,order_id,customer_id,invoice_number,payment_method,amount,internal_notes) values(p_business_id,saved.id,p_customer_id,'INV-'||saved.order_number,'Cash',p_payment_amount,'Opening payment recorded with order'); end if;
  return saved.id;
end $$;

create or replace function public.gbgs_update_order_and_payment(p_business_id uuid,p_order_id uuid,p_meal_id uuid,p_values jsonb,p_target_paid numeric)
returns void language plpgsql security invoker set search_path=public as $$
declare saved public.gbgs_orders%rowtype; current_paid numeric; delta numeric; payment public.gbgs_payments%rowtype; refund_amount numeric;
begin
  if not exists(select 1 from public.gbgs_menu_meals where id=p_meal_id and business_id=p_business_id) then raise exception 'Meal does not belong to this business'; end if;
  update public.gbgs_orders set meal_id=p_meal_id,meal_count=greatest(1,coalesce((p_values->>'meal_count')::integer,meal_count)),fulfillment_date=nullif(p_values->>'fulfillment_date','')::date,delivery_method=p_values->>'delivery_method',subtotal=(p_values->>'subtotal')::numeric,delivery_fee=(p_values->>'delivery_fee')::numeric,discount=(p_values->>'discount')::numeric,total=(p_values->>'total')::numeric,notes=nullif(p_values->>'notes','') where id=p_order_id and business_id=p_business_id returning * into saved;
  if saved.id is null then raise exception 'Order does not belong to this business'; end if;
  select coalesce(sum(case when status='Refunded' then -amount else amount end),0) into current_paid from public.gbgs_payments where order_id=p_order_id and record_type='Transaction';
  delta:=greatest(0,p_target_paid)-greatest(0,current_paid);
  if delta>0.001 then
    insert into public.gbgs_payments(business_id,order_id,customer_id,invoice_number,payment_method,amount,internal_notes) values(p_business_id,p_order_id,saved.customer_id,'INV-'||saved.order_number,'Cash',delta,'Payment adjustment from Orders HQ');
  elsif delta < -0.001 then
    delta:=abs(delta);
    for payment in select * from public.gbgs_payments where order_id=p_order_id and status='Completed' and record_type='Transaction' order by payment_date desc loop
      exit when delta<=0.001; refund_amount:=least(delta,payment.amount);
      insert into public.gbgs_payments(business_id,order_id,customer_id,invoice_number,payment_method,amount,status,parent_payment_id,internal_notes) values(p_business_id,p_order_id,saved.customer_id,'INV-'||saved.order_number,payment.payment_method,refund_amount,'Refunded',payment.id,'Payment adjustment from Orders HQ');
      delta:=delta-refund_amount;
    end loop;
    if delta>0.001 then raise exception 'Refund exceeds completed payments'; end if;
  else
    update public.gbgs_orders set balance_due=greatest(0,total-p_target_paid),amount_paid=greatest(0,p_target_paid),payment_status=case when p_target_paid<=0 then 'Unpaid' when p_target_paid>=total then 'Paid' else 'Partial' end where id=p_order_id;
  end if;
end $$;

grant execute on function public.gbgs_replace_meal_recipe(uuid,uuid,jsonb) to authenticated;
grant execute on function public.gbgs_receive_inventory(uuid,uuid,numeric,text) to authenticated;
grant execute on function public.gbgs_save_meal(uuid,uuid,jsonb,jsonb) to authenticated;
grant execute on function public.gbgs_apply_production_plan(uuid,jsonb,jsonb,jsonb,uuid[],text) to authenticated;
grant execute on function public.gbgs_transition_order(uuid,uuid,text,text) to authenticated;
grant execute on function public.gbgs_set_order_payment_status(uuid,uuid,text) to authenticated;
grant execute on function public.gbgs_create_order(uuid,uuid,uuid,uuid,jsonb,numeric) to authenticated;
grant execute on function public.gbgs_update_order_and_payment(uuid,uuid,uuid,jsonb,numeric) to authenticated;

-- Recreate triggers with canonical definitions.
drop trigger if exists gbgs_payments_recalculate_order on public.gbgs_payments;
drop trigger if exists gbgs_payments_recalculate_order_insert on public.gbgs_payments;
drop trigger if exists gbgs_payments_recalculate_order_update on public.gbgs_payments;
drop trigger if exists gbgs_payments_recalculate_order_delete on public.gbgs_payments;
create trigger gbgs_payments_recalculate_order_insert after insert on public.gbgs_payments for each row when(new.record_type='Transaction') execute function public.gbgs_recalculate_order_payment();
create trigger gbgs_payments_recalculate_order_update after update on public.gbgs_payments for each row when(old.record_type='Transaction' or new.record_type='Transaction') execute function public.gbgs_recalculate_order_payment();
create trigger gbgs_payments_recalculate_order_delete after delete on public.gbgs_payments for each row when(old.record_type='Transaction') execute function public.gbgs_recalculate_order_payment();
drop trigger if exists gbgs_orders_sync_payment_summary on public.gbgs_orders;
create trigger gbgs_orders_sync_payment_summary after insert or update of customer_id,order_number,total,amount_paid,balance_due,payment_status on public.gbgs_orders for each row execute function public.gbgs_sync_order_payment_summary();
drop trigger if exists gbgs_orders_sync_delivery on public.gbgs_orders;
create trigger gbgs_orders_sync_delivery after insert or update of order_status,fulfillment_date,delivery_method,notes on public.gbgs_orders for each row execute function public.gbgs_sync_order_delivery();
drop trigger if exists gbgs_orders_sync_calendar_event on public.gbgs_orders;
create trigger gbgs_orders_sync_calendar_event after insert or update of fulfillment_date,order_status,delivery_method,customer_id,notes on public.gbgs_orders for each row execute function public.gbgs_sync_order_calendar_event();
drop trigger if exists gbgs_orders_validate_meal_business on public.gbgs_orders;
create trigger gbgs_orders_validate_meal_business before insert or update of meal_id,business_id on public.gbgs_orders for each row execute function public.gbgs_validate_order_meal_business();
drop trigger if exists gbgs_menu_ingredients_validate_inventory_business on public.gbgs_menu_ingredients;
create trigger gbgs_menu_ingredients_validate_inventory_business before insert or update of meal_id,inventory_item_id on public.gbgs_menu_ingredients for each row execute function public.gbgs_validate_recipe_inventory_business();

-- RLS/policies used by the authenticated application.
alter table public.gbgs_payments enable row level security;
alter table public.gbgs_deliveries enable row level security;
alter table public.gbgs_menu_ingredients enable row level security;
alter table public.gbgs_inventory_items enable row level security;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='gbgs_payments' and policyname='Authenticated users manage Miz Rita payments') then create policy "Authenticated users manage Miz Rita payments" on public.gbgs_payments for all to authenticated using(true) with check(true); end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='gbgs_deliveries' and policyname='Authenticated users manage Miz Rita deliveries') then create policy "Authenticated users manage Miz Rita deliveries" on public.gbgs_deliveries for all to authenticated using(true) with check(true); end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='gbgs_menu_ingredients' and policyname='Authenticated users can manage menu ingredients') then create policy "Authenticated users can manage menu ingredients" on public.gbgs_menu_ingredients for all to authenticated using(true) with check(true); end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='gbgs_inventory_items' and policyname='Authenticated users manage Miz Rita inventory') then create policy "Authenticated users manage Miz Rita inventory" on public.gbgs_inventory_items for all to authenticated using(true) with check(true); end if;
end $$;

-- Backfill database-owned downstream records after safe trigger installation.
insert into public.gbgs_payments(business_id,order_id,customer_id,invoice_number,payment_method,amount,amount_due,balance,status,record_type,internal_notes)
select o.business_id,o.id,o.customer_id,'INV-'||o.order_number,'Cash',coalesce(o.amount_paid,0),coalesce(o.total,0),coalesce(o.balance_due,o.total,0),public.gbgs_payment_summary_status(o.payment_status),'Order Summary','Automatically synchronized from order' from public.gbgs_orders o
on conflict(order_id) where record_type='Order Summary' do update set amount=excluded.amount,amount_due=excluded.amount_due,balance=excluded.balance,status=excluded.status,updated_at=now();
insert into public.gbgs_calendar_events(user_id,title,event_date,start_time,end_time,location,notes,completed,source,source_id,category)
select coalesce(o.created_by,owner.user_id),coalesce(o.delivery_method,'Pickup')||' - '||o.order_number,o.fulfillment_date,time '12:00',null,null,o.notes,lower(o.order_status) in('completed','delivered'),'Order',o.id,'Fulfillment' from public.gbgs_orders o left join lateral(select member.user_id from public.gbgs_business_members member where member.business_id=o.business_id order by case lower(coalesce(member.role,'')) when 'owner' then 0 when 'admin' then 1 else 2 end,member.created_at,member.id limit 1) owner on true where o.fulfillment_date is not null and not exists(select 1 from public.gbgs_calendar_events e where e.source='Order' and e.source_id=o.id);

-- Final verification: abort the transaction if any required object is absent.
do $$
declare missing text;
begin
  select string_agg(object_name, ', ') into missing from (
    select format('%s.%s',table_name,column_name) object_name
    from (values
      ('gbgs_orders','meal_id'),('gbgs_orders','meal_count'),
      ('gbgs_payments','record_type'),('gbgs_payments','amount_due'),('gbgs_payments','balance'),
      ('gbgs_deliveries','delivery_type'),('gbgs_deliveries','activity_timeline'),
      ('gbgs_menu_ingredients','inventory_item_id'),('gbgs_menu_ingredients','preparation_notes'),('gbgs_menu_ingredients','recipe_unit'),
      ('gbgs_inventory_items','is_active')
    ) required(table_name,column_name)
    where not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=required.table_name and c.column_name=required.column_name)
    union all
    select name from (values
      ('gbgs_orders_meal_id_idx'),('gbgs_payments_order_summary_idx'),
      ('gbgs_deliveries_order_id_idx'),('gbgs_menu_ingredients_inventory_item_id_idx'),('gbgs_inventory_items_active_name_idx')
    ) required(name) where to_regclass('public.'||name) is null
    union all
    select signature from (values
      ('public.gbgs_payment_summary_status(text)'),('public.gbgs_sync_order_payment_summary()'),
      ('public.gbgs_recalculate_order_payment()'),('public.gbgs_delivery_status(text)'),
      ('public.gbgs_sync_order_delivery()'),('public.gbgs_sync_order_calendar_event()'),
      ('public.gbgs_validate_order_meal_business()'),('public.gbgs_validate_recipe_inventory_business()')
      ,('public.gbgs_replace_meal_recipe(uuid,uuid,jsonb)'),('public.gbgs_receive_inventory(uuid,uuid,numeric,text)'),
      ('public.gbgs_transition_order(uuid,uuid,text,text)'),('public.gbgs_set_order_payment_status(uuid,uuid,text)'),
      ('public.gbgs_create_order(uuid,uuid,uuid,uuid,jsonb,numeric)'),('public.gbgs_update_order_and_payment(uuid,uuid,uuid,jsonb,numeric)'),
      ('public.gbgs_save_meal(uuid,uuid,jsonb,jsonb)'),('public.gbgs_apply_production_plan(uuid,jsonb,jsonb,jsonb,uuid[],text)')
    ) required(signature) where to_regprocedure(signature) is null
    union all
    select trigger_name from (values
      ('gbgs_payments_recalculate_order_insert'),('gbgs_payments_recalculate_order_update'),('gbgs_payments_recalculate_order_delete'),
      ('gbgs_orders_sync_payment_summary'),('gbgs_orders_sync_delivery'),('gbgs_orders_sync_calendar_event'),
      ('gbgs_orders_validate_meal_business'),('gbgs_menu_ingredients_validate_inventory_business')
    ) required(trigger_name) where not exists(select 1 from pg_trigger where tgname=required.trigger_name and not tgisinternal)
    union all
    select constraint_name from (values
      ('gbgs_orders_meal_count_check'),('gbgs_payments_amount_check'),('gbgs_payments_status_check'),
      ('gbgs_payments_record_type_check'),('gbgs_deliveries_delivery_type_check'),
      ('gbgs_deliveries_status_check'),
      ('gbgs_menu_ingredients_recipe_unit_check')
    ) required(constraint_name) where not exists(select 1 from pg_constraint where conname=required.constraint_name)
    union all
    select policy_name from (values
      ('Authenticated users manage Miz Rita payments'),
      ('Authenticated users manage Miz Rita deliveries'),('Authenticated users can manage menu ingredients'),
      ('Authenticated users manage Miz Rita inventory')
    ) required(policy_name) where not exists(select 1 from pg_policies where schemaname='public' and policyname=required.policy_name)
  ) absent;
  if missing is not null then raise exception 'Production schema reconciliation incomplete; missing: %',missing; end if;
  if exists(select 1 from public.gbgs_orders where meal_count<1 or meal_count is null) then raise exception 'Production schema reconciliation incomplete: invalid meal_count rows'; end if;
  if exists(select 1 from public.gbgs_payments where record_type is null or amount_due is null or balance is null) then raise exception 'Production schema reconciliation incomplete: invalid payment rows'; end if;
  if exists(select 1 from public.gbgs_orders o where o.fulfillment_date is not null and not exists(select 1 from public.gbgs_calendar_events e where e.source='Order' and e.source_id=o.id)) then raise exception 'Production schema reconciliation incomplete: order calendar event missing'; end if;
end $$;
