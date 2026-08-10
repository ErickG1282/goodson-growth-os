-- Fix both active database paths that could create a Production Completed
-- Notification Center row for one Packaging transition.

update public.gbgs_notifications
set is_read=true
where title='Production Completed' and not is_read;

with duplicate_packaging as (
  select id,row_number() over(
    partition by business_id,related_order_id,title order by created_at desc,id desc
  ) as row_number
  from public.gbgs_notifications
  where title='Packaging Required' and not is_read
)
update public.gbgs_notifications notification set is_read=true
from duplicate_packaging duplicate
where notification.id=duplicate.id and duplicate.row_number>1;

create unique index if not exists gbgs_notifications_one_active_packaging_required
  on public.gbgs_notifications(business_id,related_order_id,title)
  where title='Packaging Required' and not is_read;

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
      ' - Order '||order_row.order_number||'. Meals have finished cooking and are ready to be packaged.',
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

-- Phase 5 independently mirrored its queued internal completion communication
-- into the Notification Center. Stop queuing completion communications so the
-- workflow trigger above remains the single notification source.
create or replace function public.gbgs_communication_from_workflow()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  event_name text:=case
    when lower(coalesce(new.label,'')) like '%reopened%' then 'Production Reopened'
    when lower(coalesce(new.label,'')) like '%started%' and lower(coalesce(new.label,'')) like '%packag%' then 'Packaging Started'
    when lower(coalesce(new.label,'')) like '%started%' then 'Production Started'
    when lower(coalesce(new.label,'')) like '%paused%' then 'Production Paused'
    when lower(coalesce(new.label,'')) like '%resumed%' then 'Production Resumed'
    when lower(coalesce(new.label,'')) like '%stopped%' then 'Production Stopped'
    else null
  end;
begin
  if event_name is null then return new; end if;
  perform public.gbgs_queue_communication(new.business_id,new.order_id,event_name,'Internal','Kitchen',new.user_id,new.reason);
  if event_name='Production Started' then
    perform public.gbgs_queue_communication(new.business_id,new.order_id,event_name,'Email','Customer',new.user_id);
    perform public.gbgs_queue_communication(new.business_id,new.order_id,event_name,'SMS','Customer',new.user_id);
  end if;
  return new;
end $$;

drop trigger if exists gbgs_workflow_queue_communications on public.gbgs_order_workflow_events;
create trigger gbgs_workflow_queue_communications
after insert on public.gbgs_order_workflow_events
for each row execute function public.gbgs_communication_from_workflow();

-- Defense in depth: a legacy completion communication may remain in history or
-- be retried, but it must not be converted into another notification row.
create or replace function public.gbgs_communication_notification()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='Queued' and coalesce(new.subject,'') not in (
    'Production Completed','Packaging Complete','Your Meals Have Been Packaged'
  ) then
    perform public.gbgs_create_notification(
      new.business_id,
      case when new.communication_type='Driver' then 'Deliveries' when new.communication_type='Internal' then 'Kitchen' else 'Orders' end,
      case when new.communication_type='Driver' then 'Driver Notified' when new.communication_type='Email' then 'Customer Email Queued' when new.communication_type='SMS' then 'Customer SMS Queued' else new.subject end,
      new.recipient_name||': '||new.subject,
      new.order_id,new.customer_id,'info',new.created_by
    );
  end if;
  return new;
end $$;

drop trigger if exists gbgs_communications_create_notification on public.gbgs_communications;
create trigger gbgs_communications_create_notification
after insert on public.gbgs_communications
for each row execute function public.gbgs_communication_notification();
