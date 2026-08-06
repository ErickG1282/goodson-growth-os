create table if not exists public.gbgs_notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.gbgs_businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.gbgs_orders(id) on delete cascade,
  customer_id uuid references public.gbgs_customers(id) on delete set null,
  notification_type text not null,
  category text not null check (category in ('Orders','Kitchen','Deliveries','Inventory','Payments','Calendar')),
  customer_name text,
  order_number text,
  message text not null,
  source_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, source_key)
);

create index if not exists gbgs_notifications_user_created_idx on public.gbgs_notifications(user_id, created_at desc);
create index if not exists gbgs_notifications_business_idx on public.gbgs_notifications(business_id);
alter table public.gbgs_notifications enable row level security;
drop policy if exists "Users read their Miz Rita notifications" on public.gbgs_notifications;
create policy "Users read their Miz Rita notifications" on public.gbgs_notifications for select to authenticated using (user_id=auth.uid());
drop policy if exists "Users update their Miz Rita notifications" on public.gbgs_notifications;
create policy "Users update their Miz Rita notifications" on public.gbgs_notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

create or replace function public.gbgs_emit_notification(
  p_business_id uuid, p_order_id uuid, p_type text, p_category text,
  p_message text, p_source_key text, p_customer_id uuid default null
) returns void language plpgsql security definer set search_path=public as $$
declare order_row public.gbgs_orders%rowtype; resolved_customer uuid; resolved_name text; resolved_number text; recipient record;
begin
  if p_order_id is not null then select * into order_row from public.gbgs_orders where id=p_order_id;
  end if;
  resolved_customer:=coalesce(p_customer_id,order_row.customer_id);
  select trim(concat_ws(' ',first_name,last_name)) into resolved_name from public.gbgs_customers where id=resolved_customer;
  resolved_number:=order_row.order_number;
  for recipient in
    select user_id from public.gbgs_business_members where business_id=p_business_id
    union select order_row.created_by where order_row.created_by is not null
  loop
    insert into public.gbgs_notifications(business_id,user_id,order_id,customer_id,notification_type,category,customer_name,order_number,message,source_key)
    values(p_business_id,recipient.user_id,p_order_id,resolved_customer,p_type,p_category,resolved_name,resolved_number,p_message,p_source_key)
    on conflict(user_id,source_key) do nothing;
  end loop;
end $$;

create or replace function public.gbgs_notify_new_order() returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.gbgs_emit_notification(new.business_id,new.id,'New Order Created','Orders','A new order was created.','order-created:'||new.id,new.customer_id); return new; end $$;
drop trigger if exists gbgs_orders_notify_created on public.gbgs_orders;
create trigger gbgs_orders_notify_created after insert on public.gbgs_orders for each row execute function public.gbgs_notify_new_order();

create or replace function public.gbgs_notify_workflow_event() returns trigger language plpgsql security definer set search_path=public as $$
declare event_type text;
begin
  event_type:=case
    when lower(new.label) like '%started%' then 'Production Started'
    when lower(new.label) like '%paused%' then 'Production Paused'
    when lower(new.label) like '%resumed%' then 'Production Resumed'
    when lower(new.label) like '%completed%' or lower(new.status)='packaging' then 'Packaging'
    else null end;
  if event_type is not null then perform public.gbgs_emit_notification(new.business_id,new.order_id,event_type,'Kitchen',event_type||'.','workflow:'||new.id); end if;
  return new;
end $$;
drop trigger if exists gbgs_workflow_notify on public.gbgs_order_workflow_events;
create trigger gbgs_workflow_notify after insert on public.gbgs_order_workflow_events for each row execute function public.gbgs_notify_workflow_event();

create or replace function public.gbgs_notify_delivery_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.driver_name is not null and (tg_op='INSERT' or old.driver_name is distinct from new.driver_name) then
    perform public.gbgs_emit_notification(new.business_id,new.order_id,'Driver Assigned','Deliveries','Driver assigned: '||new.driver_name,'driver:'||new.id||':'||coalesce(new.driver_name,''));
  end if;
  if tg_op='INSERT' or old.status is distinct from new.status then
    if lower(new.status) in ('ready','ready for pickup') then perform public.gbgs_emit_notification(new.business_id,new.order_id,'Ready for Pickup','Deliveries','Order is ready for pickup.','delivery-ready:'||new.id);
    elsif lower(new.status)='out for delivery' then perform public.gbgs_emit_notification(new.business_id,new.order_id,'Out for Delivery','Deliveries','Order is out for delivery.','delivery-out:'||new.id);
    elsif lower(new.status)='delivered' then perform public.gbgs_emit_notification(new.business_id,new.order_id,'Delivered','Deliveries','Order was delivered.','delivery-delivered:'||new.id); end if;
  end if;
  return new;
end $$;
drop trigger if exists gbgs_deliveries_notify on public.gbgs_deliveries;
create trigger gbgs_deliveries_notify after insert or update of status,driver_name on public.gbgs_deliveries for each row execute function public.gbgs_notify_delivery_change();

create or replace function public.gbgs_notify_payment() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.record_type='Transaction' and new.status='Completed' and new.amount>0 then
    perform public.gbgs_emit_notification(new.business_id,new.order_id,'Payment Received','Payments','Payment received: $'||to_char(new.amount,'FM999999990.00'),'payment:'||new.id,new.customer_id);
  end if; return new;
end $$;
drop trigger if exists gbgs_payments_notify on public.gbgs_payments;
create trigger gbgs_payments_notify after insert on public.gbgs_payments for each row execute function public.gbgs_notify_payment();

create or replace function public.gbgs_notify_low_inventory() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.is_active and new.quantity<=new.par_level and (tg_op='INSERT' or old.quantity>old.par_level or old.par_level is distinct from new.par_level) then
    perform public.gbgs_emit_notification(new.business_id,null,'Low Inventory','Inventory',new.name||' is at or below par level.','inventory-low:'||new.id||':'||new.quantity::text,null);
  end if; return new;
end $$;
drop trigger if exists gbgs_inventory_notify_low on public.gbgs_inventory_items;
create trigger gbgs_inventory_notify_low after insert or update of quantity,par_level,is_active on public.gbgs_inventory_items for each row execute function public.gbgs_notify_low_inventory();

create or replace function public.gbgs_refresh_time_notifications(p_business_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare item record; alert_type text;
begin
  if auth.uid() is null or not exists(select 1 from public.gbgs_business_members where business_id=p_business_id and user_id=auth.uid()) then raise exception 'Not authorized for this business'; end if;
  for item in select d.*,o.customer_id from public.gbgs_deliveries d join public.gbgs_orders o on o.id=d.order_id where d.business_id=p_business_id and d.scheduled_at is not null and lower(d.status) not in ('delivered','cancelled') loop
    alert_type:=case when item.scheduled_at<now() and item.delivery_type='Pickup' then 'Pickup Overdue' when item.scheduled_at<now() then 'Delivery Overdue' when item.delivery_type='Pickup' and item.scheduled_at<=now()+interval '2 hours' then 'Pickup Due Soon' end;
    if alert_type is not null then perform public.gbgs_emit_notification(p_business_id,item.order_id,alert_type,'Calendar',alert_type||'.','schedule:'||lower(replace(alert_type,' ', '-'))||':'||item.id,item.customer_id); end if;
  end loop;
end $$;
grant execute on function public.gbgs_refresh_time_notifications(uuid) to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='gbgs_notifications') then alter publication supabase_realtime add table public.gbgs_notifications; end if;
end $$;
