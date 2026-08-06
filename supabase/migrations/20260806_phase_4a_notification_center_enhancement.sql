create or replace function public.gbgs_notify_production_event() returns trigger language plpgsql security definer set search_path=public as $$
declare notification_title text; notification_severity text:='info'; order_row public.gbgs_orders%rowtype;
begin
  select * into order_row from public.gbgs_orders where id=new.order_id;
  notification_title:=case
    when lower(new.label) like '%reopened%' then 'Production Reopened'
    when lower(new.label) like '%started%' then 'Production Started'
    when lower(new.label) like '%paused%' then 'Production Paused'
    when lower(new.label) like '%resumed%' then 'Production Resumed'
    when lower(new.label) like '%stopped%' then 'Production Stopped'
    when lower(new.label) like '%completed%' or lower(new.status)='packaging' then 'Production Completed'
    else null end;
  if notification_title is not null then
    notification_severity:=case when notification_title='Production Stopped' then 'critical' when notification_title='Production Paused' then 'warning' when notification_title='Production Completed' then 'success' else 'info' end;
    perform public.gbgs_create_notification(new.business_id,'Kitchen',notification_title,notification_title||case when new.reason is not null then ': '||new.reason else '.' end,new.order_id,order_row.customer_id,notification_severity,new.user_id);
    if notification_title='Production Completed' then
      perform public.gbgs_create_notification(new.business_id,'Kitchen','Packaging Ready','Meal count: '||coalesce(order_row.meal_count,0)||'. Order is ready for packaging.',new.order_id,order_row.customer_id,'warning',new.user_id);
    end if;
  end if;
  return new;
end $$;

create or replace function public.gbgs_notify_new_order() returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.gbgs_create_notification(new.business_id,'Orders','New Order','Meal count: '||coalesce(new.meal_count,0)||'. Fulfillment: '||coalesce(new.delivery_method,'Pickup')||'.',new.id,new.customer_id,'info',new.created_by);
  return new;
end $$;

create or replace function public.gbgs_notify_payment_received() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.record_type='Transaction' and new.status='Completed' and new.amount>0 then
    perform public.gbgs_create_notification(new.business_id,'Payments','Payment Received','Amount received: $'||to_char(new.amount,'FM999999990.00')||'.',new.order_id,new.customer_id,'success',auth.uid());
  end if;
  return new;
end $$;

create or replace function public.gbgs_notify_inventory_low() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.is_active and new.quantity<=new.par_level and (tg_op='INSERT' or old.quantity>old.par_level or old.par_level is distinct from new.par_level) then
    perform public.gbgs_create_notification(new.business_id,'Inventory','Inventory Low',new.name||': current quantity '||new.quantity||' '||new.unit||'; par level '||new.par_level||' '||new.unit||'.',null,null,'critical',auth.uid());
  end if;
  return new;
end $$;

create or replace function public.gbgs_notify_delivery_updates() returns trigger language plpgsql security definer set search_path=public as $$
declare order_row public.gbgs_orders%rowtype; notification_title text;
begin
  select * into order_row from public.gbgs_orders where id=new.order_id;
  if new.driver_name is not null and (tg_op='INSERT' or old.driver_name is distinct from new.driver_name) then
    perform public.gbgs_create_notification(new.business_id,'Deliveries','Driver Assigned','Driver: '||new.driver_name||'.',new.order_id,order_row.customer_id,'warning',auth.uid());
  end if;
  if (tg_op='INSERT' or old.status is distinct from new.status) and lower(new.status)='ready' then
    notification_title:=case when new.delivery_type='Delivery' then 'Ready for Delivery' else 'Ready for Pickup' end;
    perform public.gbgs_create_notification(new.business_id,'Deliveries',notification_title,
      coalesce(new.delivery_type,'Pickup')||case when new.driver_name is not null then '. Driver: '||new.driver_name else '. Driver: Not assigned' end||'.',
      new.order_id,order_row.customer_id,'success',auth.uid());
  end if;
  if (tg_op='INSERT' or old.status is distinct from new.status) and lower(new.status)='delivered' then
    perform public.gbgs_create_notification(new.business_id,'Deliveries','Delivery Completed','Delivery completed.',new.order_id,order_row.customer_id,'success',auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists gbgs_deliveries_create_ready_notification on public.gbgs_deliveries;
create trigger gbgs_deliveries_create_ready_notification after insert or update of status,driver_name on public.gbgs_deliveries
for each row execute function public.gbgs_notify_delivery_updates();
