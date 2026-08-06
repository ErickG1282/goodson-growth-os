-- Store order quantity once, on the order, and make every workflow consume it.
alter table public.gbgs_orders add column if not exists meal_count integer;

-- Recover quantities written by older clients into notes before removing that
-- duplicated representation. Unknown legacy quantities use the schema default.
update public.gbgs_orders
set meal_count = greatest(
  1,
  coalesce(
    (regexp_match(coalesce(notes, ''), '(?im)^Number of Meals:\s*([0-9]+)\s*$'))[1]::integer,
    1
  )
)
where meal_count is null;

update public.gbgs_orders
set notes = nullif(
  btrim(regexp_replace(coalesce(notes, ''), '(?im)^Number of Meals:\s*.*(?:\r?\n)?', '', 'g')),
  ''
)
where coalesce(notes, '') ~* '(?m)^Number of Meals:';

alter table public.gbgs_orders alter column meal_count set default 1;
alter table public.gbgs_orders alter column meal_count set not null;
alter table public.gbgs_orders drop constraint if exists gbgs_orders_meal_count_check;
alter table public.gbgs_orders
  add constraint gbgs_orders_meal_count_check check (meal_count > 0);

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
    business_id, created_by, customer_id, meal_id, meal_count, order_number, order_date,
    fulfillment_date, order_status, payment_status, delivery_method, subtotal,
    delivery_fee, discount, amount_paid, total, balance_due, notes
  ) values (
    p_business_id, p_created_by, p_customer_id, p_meal_id,
    greatest(1, coalesce((p_values->>'meal_count')::integer, 1)),
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
    meal_count = greatest(1, coalesce((p_values->>'meal_count')::integer, meal_count)),
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
  into current_paid from public.gbgs_payments
  where order_id = p_order_id and record_type = 'Transaction';
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
      where order_id = p_order_id and status = 'Completed' and record_type = 'Transaction'
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

grant execute on function public.gbgs_create_order(uuid, uuid, uuid, uuid, jsonb, numeric) to authenticated;
grant execute on function public.gbgs_update_order_and_payment(uuid, uuid, uuid, jsonb, numeric) to authenticated;

do $$
begin
  if exists (select 1 from public.gbgs_orders where meal_count is null or meal_count < 1) then
    raise exception 'Meal count migration failed: every order must have a positive quantity';
  end if;
end;
$$;
