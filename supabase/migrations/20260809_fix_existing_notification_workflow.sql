-- Replace the legacy production-completed notification and add the persisted
-- Packaging -> Ready transition without changing cooking production behavior.

alter table public.gbgs_orders drop constraint if exists gbgs_orders_production_status_check;
alter table public.gbgs_orders add constraint gbgs_orders_production_status_check
  check (production_status in ('Waiting','Cooking','Paused','Stopped','Packaging','Ready For Pickup','Ready For Delivery','Completed'));

update public.gbgs_notifications
set is_read=true
where title in ('Production Completed','Packaging Ready') and not is_read;

with duplicates as (
  select id,row_number() over(partition by business_id,related_order_id,title order by created_at desc,id desc) as row_number
  from public.gbgs_notifications
  where not is_read and title in ('Packaging Required','Ready for Pickup','Delivery Ready')
)
update public.gbgs_notifications n set is_read=true
from duplicates d where n.id=d.id and d.row_number>1;

create unique index if not exists gbgs_notifications_one_active_packaging_required
  on public.gbgs_notifications(business_id,related_order_id,title)
  where title='Packaging Required' and not is_read;
create unique index if not exists gbgs_notifications_one_active_fulfillment_ready
  on public.gbgs_notifications(business_id,related_order_id,title)
  where title in ('Ready for Pickup','Delivery Ready') and not is_read;

create or replace function public.gbgs_notify_production_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  event_title text;
  event_severity text:='info';
  order_row public.gbgs_orders%rowtype;
  customer_row public.gbgs_customers%rowtype;
begin
  select * into order_row from public.gbgs_orders where id=new.order_id;
  select * into customer_row from public.gbgs_customers where id=order_row.customer_id;

  if lower(coalesce(new.status,''))='packaging' then
    insert into public.gbgs_notifications(
      business_id,category,title,message,related_order_id,related_customer_id,severity,is_read,created_by
    ) values (
      new.business_id,'Kitchen','Packaging Required',
      'Packaging required for '||trim(concat_ws(' ',customer_row.first_name,customer_row.last_name))||
      ' - Order '||order_row.order_number||'. '||coalesce(order_row.meal_count,0)||
      ' meals have finished cooking and are ready to be packaged.',
      order_row.id,order_row.customer_id,'warning',false,new.user_id
    ) on conflict(business_id,related_order_id,title)
      where title='Packaging Required' and not is_read do nothing;
    return new;
  end if;

  event_title:=case
    when lower(coalesce(new.label,'')) like '%reopened%' then 'Production Reopened'
    when lower(coalesce(new.label,'')) like '%started%' then 'Production Started'
    when lower(coalesce(new.label,'')) like '%paused%' then 'Production Paused'
    when lower(coalesce(new.label,'')) like '%resumed%' then 'Production Resumed'
    when lower(coalesce(new.label,'')) like '%stopped%' then 'Production Stopped'
    else null
  end;
  if event_title is not null then
    event_severity:=case when event_title='Production Stopped' then 'critical' when event_title='Production Paused' then 'warning' else 'info' end;
    perform public.gbgs_create_notification(new.business_id,'Kitchen',event_title,
      event_title||case when new.reason is not null then ': '||new.reason else '.' end,
      new.order_id,order_row.customer_id,event_severity,new.user_id);
  end if;
  return new;
end $$;

drop trigger if exists gbgs_workflow_create_notification on public.gbgs_order_workflow_events;
create trigger gbgs_workflow_create_notification
after insert on public.gbgs_order_workflow_events
for each row execute function public.gbgs_notify_production_event();

create or replace function public.gbgs_notify_delivery_updates()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  order_row public.gbgs_orders%rowtype;
  customer_row public.gbgs_customers%rowtype;
  ready_title text;
  ready_message text;
  timing text;
begin
  select * into order_row from public.gbgs_orders where id=new.order_id;
  select * into customer_row from public.gbgs_customers where id=order_row.customer_id;

  if new.driver_name is not null and (tg_op='INSERT' or old.driver_name is distinct from new.driver_name) then
    perform public.gbgs_create_notification(new.business_id,'Deliveries','Driver Assigned','Driver: '||new.driver_name||'.',new.order_id,order_row.customer_id,'warning',auth.uid());
  end if;

  if (tg_op='INSERT' or old.status is distinct from new.status) and lower(new.status)='ready' then
    update public.gbgs_notifications set is_read=true
    where business_id=new.business_id and related_order_id=new.order_id
      and title='Packaging Required' and not is_read;

    ready_title:=case when lower(coalesce(new.delivery_type,'pickup'))='delivery' then 'Delivery Ready' else 'Ready for Pickup' end;
    ready_message:=trim(concat_ws(' ',customer_row.first_name,customer_row.last_name))||' - Order '||order_row.order_number||
      ' is packaged and ready for '||case when ready_title='Delivery Ready' then 'delivery' else 'pickup' end||'. '||
      coalesce(order_row.meal_count,0)||' meals.';
    timing:=case when new.scheduled_at is not null then ' Scheduled: '||to_char(new.scheduled_at,'Mon DD, YYYY FMHH12:MI AM')||'.' else '' end;
    if new.driver_name is not null then timing:=timing||' Driver: '||new.driver_name||'.'; end if;

    insert into public.gbgs_notifications(
      business_id,category,title,message,related_order_id,related_customer_id,severity,is_read,created_by
    ) values (
      new.business_id,'Deliveries',ready_title,ready_message||timing,new.order_id,order_row.customer_id,'success',false,coalesce(auth.uid(),order_row.created_by)
    ) on conflict(business_id,related_order_id,title)
      where title in ('Ready for Pickup','Delivery Ready') and not is_read do nothing;
  end if;

  if (tg_op='INSERT' or old.status is distinct from new.status) and lower(new.status)='delivered' then
    perform public.gbgs_create_notification(new.business_id,'Deliveries','Delivery Completed','Delivery completed.',new.order_id,order_row.customer_id,'success',auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists gbgs_deliveries_create_ready_notification on public.gbgs_deliveries;
create trigger gbgs_deliveries_create_ready_notification
after insert or update of status,driver_name on public.gbgs_deliveries
for each row execute function public.gbgs_notify_delivery_updates();

create or replace function public.gbgs_complete_packaging(p_business_id uuid,p_order_id uuid)
returns void language plpgsql security invoker set search_path=public as $$
declare
  current_order public.gbgs_orders%rowtype;
  next_production_status text;
  actor uuid:=auth.uid();
begin
  select * into current_order from public.gbgs_orders
  where id=p_order_id and business_id=p_business_id for update;
  if current_order.id is null then raise exception 'Order does not belong to this business'; end if;
  if current_order.production_status<>'Packaging' then raise exception 'Only an order in Packaging can complete packaging'; end if;

  next_production_status:=case
    when lower(coalesce(current_order.delivery_method,'pickup'))='delivery' then 'Ready For Delivery'
    else 'Ready For Pickup'
  end;

  -- Updating order_status first intentionally invokes the existing Delivery and
  -- Calendar synchronization. The second update preserves the more specific
  -- production status for Kitchen.
  update public.gbgs_orders set order_status='Ready' where id=current_order.id;
  update public.gbgs_orders set production_status=next_production_status where id=current_order.id;

  insert into public.gbgs_order_workflow_events(
    business_id,order_id,status,label,event_type,action,user_id,reason,elapsed_seconds,created_at
  ) values (
    current_order.business_id,current_order.id,next_production_status,'Packaging Complete',
    'Packaging Complete','packaging_completed',actor,null,
    coalesce(current_order.production_elapsed_seconds,0),now()
  );
end $$;

revoke all on function public.gbgs_complete_packaging(uuid,uuid) from public;
grant execute on function public.gbgs_complete_packaging(uuid,uuid) to authenticated;
