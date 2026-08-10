alter table public.gbgs_orders
  add column if not exists production_started_at timestamptz,
  add column if not exists production_paused_at timestamptz,
  add column if not exists production_resumed_at timestamptz,
  add column if not exists production_completed_at timestamptz,
  add column if not exists production_stopped_at timestamptz,
  add column if not exists production_elapsed_seconds integer not null default 0,
  add column if not exists production_stop_reason text,
  add column if not exists production_stopped_by uuid references auth.users(id),
  add column if not exists cooking_completed_at timestamptz,
  add column if not exists packaging_started_at timestamptz,
  add column if not exists packaging_paused_at timestamptz,
  add column if not exists packaging_resumed_at timestamptz,
  add column if not exists packaging_completed_at timestamptz,
  add column if not exists packaging_elapsed_seconds integer not null default 0;

alter table public.gbgs_orders drop constraint if exists gbgs_orders_production_status_check;
alter table public.gbgs_orders add constraint gbgs_orders_production_status_check check (
  production_status in ('Waiting','Cooking','Paused','Stopped','Awaiting Packaging','Packaging','Ready For Pickup','Ready For Delivery','Completed')
);

alter table public.gbgs_order_workflow_events
  add column if not exists event_type text,
  add column if not exists action text,
  add column if not exists user_id uuid references auth.users(id),
  add column if not exists reason text,
  add column if not exists elapsed_seconds integer not null default 0;

create or replace function public.gbgs_sync_order_production_status()
returns trigger language plpgsql set search_path=public as $$
begin
  new.production_status:=case
    when lower(new.order_status) in ('completed','delivered') then 'Completed'
    when lower(new.order_status) in ('ready','ready for pickup','out for delivery') then 'Ready For Pickup'
    when lower(new.order_status)='packaging' then 'Packaging'
    when lower(new.order_status) in ('cooking','preparing') then 'Cooking'
    else new.production_status
  end;
  if new.production_status='Cooking' and (tg_op='INSERT' or old.production_status is distinct from 'Cooking') then
    new.production_started_at:=coalesce(new.production_started_at,now());
    new.production_resumed_at:=coalesce(new.production_resumed_at,now());
  end if;
  return new;
end $$;

drop trigger if exists gbgs_orders_sync_production_status on public.gbgs_orders;
create trigger gbgs_orders_sync_production_status
before insert or update of order_status on public.gbgs_orders
for each row execute function public.gbgs_sync_order_production_status();

create or replace function public.gbgs_transition_production_order(
  p_business_id uuid,p_order_id uuid,p_action text,p_reason text default null
) returns void language plpgsql security invoker set search_path=public as $$
declare
  current_order public.gbgs_orders%rowtype; action_name text:=lower(trim(p_action));
  next_status text; event_label text; event_action text; actor uuid:=auth.uid();
  cooking_elapsed integer; packaging_elapsed integer; cooking_anchor timestamptz; packaging_anchor timestamptz;
begin
  select * into current_order from public.gbgs_orders where id=p_order_id and business_id=p_business_id for update;
  if current_order.id is null then raise exception 'Order does not belong to this business'; end if;
  cooking_elapsed:=coalesce(current_order.production_elapsed_seconds,0);
  packaging_elapsed:=coalesce(current_order.packaging_elapsed_seconds,0);
  cooking_anchor:=coalesce(current_order.production_resumed_at,current_order.production_started_at,now());
  packaging_anchor:=coalesce(current_order.packaging_resumed_at,current_order.packaging_started_at,now());

  if action_name='start' then
    if current_order.production_status<>'Waiting' then raise exception 'Start Cooking requires Waiting status; current status is %',current_order.production_status; end if;
    next_status:='Cooking';event_label:='Production Started';event_action:='cooking_started';
    update public.gbgs_orders set production_status=next_status,order_status='Cooking',production_started_at=coalesce(production_started_at,now()),production_resumed_at=now(),production_paused_at=null,production_stopped_at=null,production_stop_reason=null,production_stopped_by=null where id=p_order_id;
  elsif action_name='pause' then
    if current_order.production_status<>'Cooking' then raise exception 'Pause requires Cooking status; current status is %',current_order.production_status; end if;
    cooking_elapsed:=cooking_elapsed+greatest(0,extract(epoch from(now()-cooking_anchor))::integer);
    next_status:='Paused';event_label:='Production Paused';event_action:='cooking_paused';
    update public.gbgs_orders set production_status=next_status,production_paused_at=now(),production_elapsed_seconds=cooking_elapsed where id=p_order_id;
  elsif action_name='resume' then
    if current_order.production_status not in ('Paused','Stopped') then raise exception 'Resume requires Paused or Stopped status; current status is %',current_order.production_status; end if;
    next_status:='Cooking';event_label:='Production Resumed';event_action:='cooking_resumed';
    update public.gbgs_orders set production_status=next_status,production_resumed_at=now(),production_paused_at=null,production_stopped_at=null,production_stop_reason=null,production_stopped_by=null where id=p_order_id;
  elsif action_name='stop' then
    if current_order.production_status not in ('Cooking','Paused') then raise exception 'Stop requires Cooking or Paused status; current status is %',current_order.production_status; end if;
    if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'A stop reason is required'; end if;
    if current_order.production_status='Cooking' then cooking_elapsed:=cooking_elapsed+greatest(0,extract(epoch from(now()-cooking_anchor))::integer); end if;
    next_status:='Stopped';event_label:='Production Stopped';event_action:='cooking_stopped';
    update public.gbgs_orders set production_status=next_status,production_stopped_at=now(),production_elapsed_seconds=cooking_elapsed,production_stop_reason=trim(p_reason),production_stopped_by=actor where id=p_order_id;
  elsif action_name in ('complete','complete_cooking') then
    if current_order.production_status not in ('Cooking','Paused') then raise exception 'Complete Cooking requires Cooking or Paused status; current status is %',current_order.production_status; end if;
    if current_order.production_status='Cooking' then cooking_elapsed:=cooking_elapsed+greatest(0,extract(epoch from(now()-cooking_anchor))::integer); end if;
    next_status:='Awaiting Packaging';event_label:='Production Completed';event_action:='cooking_completed';
    update public.gbgs_orders set production_status=next_status,cooking_completed_at=now(),production_completed_at=now(),production_elapsed_seconds=cooking_elapsed where id=p_order_id;
  elsif action_name='start_packaging' then
    if current_order.production_status<>'Awaiting Packaging' then raise exception 'Start Packaging requires Awaiting Packaging status; current status is %',current_order.production_status; end if;
    next_status:='Packaging';event_label:='Packaging Started';event_action:='packaging_started';
    update public.gbgs_orders set production_status=next_status,order_status='Packaging',packaging_started_at=coalesce(packaging_started_at,now()),packaging_resumed_at=now(),packaging_paused_at=null where id=p_order_id;
  elsif action_name='complete_packaging' then
    if current_order.production_status<>'Packaging' then raise exception 'Complete Packaging requires Packaging status; current status is %',current_order.production_status; end if;
    packaging_elapsed:=packaging_elapsed+greatest(0,extract(epoch from(now()-packaging_anchor))::integer);
    next_status:=case when lower(coalesce(current_order.delivery_method,'pickup'))='delivery' then 'Ready For Delivery' else 'Ready For Pickup' end;
    event_label:='Packaging Completed';event_action:='packaging_completed';
    update public.gbgs_orders set order_status='Ready' where id=p_order_id;
    update public.gbgs_orders set production_status=next_status,packaging_completed_at=now(),packaging_elapsed_seconds=packaging_elapsed where id=p_order_id;
  else raise exception 'Unsupported production action: %',p_action;
  end if;

  insert into public.gbgs_order_workflow_events(business_id,order_id,status,label,event_type,action,user_id,reason,elapsed_seconds,created_at)
  values(p_business_id,p_order_id,next_status,event_label,event_label,event_action,actor,nullif(trim(coalesce(p_reason,'')),''),case when action_name in ('start_packaging','complete_packaging') then packaging_elapsed else cooking_elapsed end,now());
end $$;

revoke all on function public.gbgs_transition_production_order(uuid,uuid,text,text) from public;
grant execute on function public.gbgs_transition_production_order(uuid,uuid,text,text) to authenticated;

create or replace function public.gbgs_complete_packaging(p_business_id uuid,p_order_id uuid)
returns void language sql security invoker set search_path=public as $$
  select public.gbgs_transition_production_order(p_business_id,p_order_id,'complete_packaging',null);
$$;
revoke all on function public.gbgs_complete_packaging(uuid,uuid) from public;
grant execute on function public.gbgs_complete_packaging(uuid,uuid) to authenticated;

create or replace function public.gbgs_notify_production_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare notification_title text; notification_message text; notification_severity text:='info'; order_row public.gbgs_orders%rowtype;
begin
  select * into order_row from public.gbgs_orders where id=new.order_id;
  notification_title:=case
    when lower(coalesce(new.label,'')) in ('production completed','cooking completed') then 'Packaging Stage'
    when lower(coalesce(new.label,''))='packaging started' then 'Packaging Started'
    when lower(coalesce(new.label,'')) in ('packaging completed','packaging complete') then 'Packaging Completed'
    when lower(coalesce(new.label,'')) like '%reopened%' then 'Production Reopened'
    when lower(coalesce(new.label,'')) like '%started%' then 'Production Started'
    when lower(coalesce(new.label,'')) like '%paused%' then 'Production Paused'
    when lower(coalesce(new.label,'')) like '%resumed%' then 'Production Resumed'
    when lower(coalesce(new.label,'')) like '%stopped%' then 'Production Stopped'
    else null end;
  if notification_title is not null then
    notification_severity:=case when notification_title='Production Stopped' then 'critical' when notification_title='Production Paused' then 'warning' when notification_title in ('Packaging Stage','Packaging Completed') then 'success' else 'info' end;
    notification_message:=case when notification_title='Packaging Stage' then 'Cooking completed. This order is now in the Packaging stage and ready to be packaged.' when notification_title='Packaging Started' then 'Packaging has started for this order.' when notification_title='Packaging Completed' then 'Packaging has been completed for this order.' else notification_title||case when new.reason is not null then ': '||new.reason else '.' end end;
    perform public.gbgs_create_notification(new.business_id,'Kitchen',notification_title,notification_message,new.order_id,order_row.customer_id,notification_severity,new.user_id);
  end if;
  return new;
end $$;

drop trigger if exists gbgs_workflow_create_notification on public.gbgs_order_workflow_events;
create trigger gbgs_workflow_create_notification after insert on public.gbgs_order_workflow_events
for each row execute function public.gbgs_notify_production_event();
