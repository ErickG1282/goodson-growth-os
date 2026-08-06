create table if not exists public.gbgs_notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.gbgs_businesses(id) on delete cascade,
  category text not null,
  title text not null,
  message text not null,
  related_order_id uuid references public.gbgs_orders(id) on delete cascade,
  related_customer_id uuid references public.gbgs_customers(id) on delete set null,
  severity text not null default 'info' check (severity in ('info','success','warning','critical')),
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists gbgs_notifications_business_created_idx on public.gbgs_notifications(business_id,created_at desc);
create index if not exists gbgs_notifications_business_unread_idx on public.gbgs_notifications(business_id,is_read) where not is_read;
create index if not exists gbgs_notifications_order_idx on public.gbgs_notifications(related_order_id);
create index if not exists gbgs_notifications_customer_idx on public.gbgs_notifications(related_customer_id);
create index if not exists gbgs_notifications_category_idx on public.gbgs_notifications(business_id,category);

alter table public.gbgs_notifications enable row level security;
drop policy if exists "Authenticated users manage Miz Rita notifications" on public.gbgs_notifications;
create policy "Authenticated users manage Miz Rita notifications" on public.gbgs_notifications
  for all to authenticated using(true) with check(true);

create or replace function public.gbgs_create_notification(
  p_business_id uuid,
  p_category text,
  p_title text,
  p_message text,
  p_related_order_id uuid default null,
  p_related_customer_id uuid default null,
  p_severity text default 'info',
  p_created_by uuid default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare notification_id uuid; customer_id uuid:=p_related_customer_id;
begin
  if customer_id is null and p_related_order_id is not null then
    select o.customer_id into customer_id from public.gbgs_orders o where o.id=p_related_order_id and o.business_id=p_business_id;
  end if;
  insert into public.gbgs_notifications(business_id,category,title,message,related_order_id,related_customer_id,severity,created_by)
  values(p_business_id,p_category,p_title,p_message,p_related_order_id,customer_id,p_severity,coalesce(p_created_by,auth.uid()))
  returning id into notification_id;
  return notification_id;
end $$;

create or replace function public.gbgs_notify_production_event() returns trigger language plpgsql security definer set search_path=public as $$
declare notification_title text; notification_severity text:='info';
begin
  notification_title:=case
    when lower(new.label) like '%reopened%' then 'Production Reopened'
    when lower(new.label) like '%started%' then 'Production Started'
    when lower(new.label) like '%paused%' then 'Production Paused'
    when lower(new.label) like '%resumed%' then 'Production Resumed'
    when lower(new.label) like '%stopped%' then 'Production Stopped'
    when lower(new.label) like '%completed%' or lower(new.status)='packaging' then 'Production Completed'
    else null end;
  if notification_title is not null then
    notification_severity:=case when notification_title='Production Stopped' then 'warning' when notification_title in ('Production Completed','Production Reopened') then 'success' else 'info' end;
    perform public.gbgs_create_notification(new.business_id,'Kitchen',notification_title,
      notification_title||case when new.reason is not null then ': '||new.reason else '.' end,
      new.order_id,null,notification_severity,new.user_id);
  end if;
  return new;
end $$;
drop trigger if exists gbgs_workflow_create_notification on public.gbgs_order_workflow_events;
create trigger gbgs_workflow_create_notification after insert on public.gbgs_order_workflow_events
for each row execute function public.gbgs_notify_production_event();

create or replace function public.gbgs_notify_new_order() returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.gbgs_create_notification(new.business_id,'Orders','New Order','Order '||new.order_number||' was created.',new.id,new.customer_id,'info',new.created_by);
  return new;
end $$;
drop trigger if exists gbgs_orders_create_notification on public.gbgs_orders;
create trigger gbgs_orders_create_notification after insert on public.gbgs_orders
for each row execute function public.gbgs_notify_new_order();

create or replace function public.gbgs_notify_payment_received() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.record_type='Transaction' and new.status='Completed' and new.amount>0 then
    perform public.gbgs_create_notification(new.business_id,'Payments','Payment Received','Payment received: $'||to_char(new.amount,'FM999999990.00'),new.order_id,new.customer_id,'success',auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists gbgs_payments_create_notification on public.gbgs_payments;
create trigger gbgs_payments_create_notification after insert on public.gbgs_payments
for each row execute function public.gbgs_notify_payment_received();

create or replace function public.gbgs_notify_inventory_low() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.is_active and new.quantity<=new.par_level and (tg_op='INSERT' or old.quantity>old.par_level or old.par_level is distinct from new.par_level) then
    perform public.gbgs_create_notification(new.business_id,'Inventory','Inventory Low',new.name||' is at or below par level.',null,null,'warning',auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists gbgs_inventory_create_notification on public.gbgs_inventory_items;
create trigger gbgs_inventory_create_notification after insert or update of quantity,par_level,is_active on public.gbgs_inventory_items
for each row execute function public.gbgs_notify_inventory_low();

grant execute on function public.gbgs_create_notification(uuid,text,text,text,uuid,uuid,text,uuid) to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='gbgs_notifications') then
    alter publication supabase_realtime add table public.gbgs_notifications;
  end if;
end $$;
