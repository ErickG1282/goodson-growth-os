alter table public.gbgs_orders
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
alter table public.gbgs_orders drop constraint if exists gbgs_orders_packaging_elapsed_check;
alter table public.gbgs_orders add constraint gbgs_orders_packaging_elapsed_check check (packaging_elapsed_seconds>=0);

create or replace function public.gbgs_transition_production_order(
  p_business_id uuid,p_order_id uuid,p_action text,p_reason text default null
) returns void language plpgsql security invoker set search_path=public as $$
declare
  current_order public.gbgs_orders%rowtype;
  action_name text:=lower(trim(p_action));
  next_status text;
  event_label text;
  event_action text;
  actor uuid:=auth.uid();
  cooking_elapsed integer;
  packaging_elapsed integer;
  cooking_anchor timestamptz;
  packaging_anchor timestamptz;
begin
  select * into current_order from public.gbgs_orders where id=p_order_id and business_id=p_business_id for update;
  if current_order.id is null then raise exception 'Order does not belong to this business'; end if;
  cooking_elapsed:=coalesce(current_order.production_elapsed_seconds,0);
  packaging_elapsed:=coalesce(current_order.packaging_elapsed_seconds,0);
  cooking_anchor:=coalesce(current_order.production_resumed_at,current_order.production_started_at,now());
  packaging_anchor:=coalesce(current_order.packaging_resumed_at,current_order.packaging_started_at,now());

  if action_name='start' then
    if current_order.production_status<>'Waiting' then raise exception 'Only waiting cooking can be started'; end if;
    next_status:='Cooking';event_label:='Cooking Started';event_action:='cooking_started';
    update public.gbgs_orders set production_status=next_status,order_status='Cooking',
      production_started_at=coalesce(production_started_at,now()),production_resumed_at=now(),
      production_paused_at=null,production_stopped_at=null,production_stop_reason=null,production_stopped_by=null
    where id=p_order_id;
  elsif action_name='pause' then
    if current_order.production_status<>'Cooking' then raise exception 'Only active cooking can be paused'; end if;
    cooking_elapsed:=cooking_elapsed+greatest(0,extract(epoch from(now()-cooking_anchor))::integer);
    next_status:='Paused';event_label:='Cooking Paused';event_action:='cooking_paused';
    update public.gbgs_orders set production_status=next_status,production_paused_at=now(),production_elapsed_seconds=cooking_elapsed where id=p_order_id;
  elsif action_name='resume' then
    if current_order.production_status<>'Paused' then raise exception 'Only paused cooking can be resumed'; end if;
    next_status:='Cooking';event_label:='Cooking Resumed';event_action:='cooking_resumed';
    update public.gbgs_orders set production_status=next_status,production_resumed_at=now() where id=p_order_id;
  elsif action_name='stop' then
    if current_order.production_status not in ('Cooking','Paused') then raise exception 'Only active cooking can be stopped'; end if;
    if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'A stop reason is required'; end if;
    if current_order.production_status='Cooking' then cooking_elapsed:=cooking_elapsed+greatest(0,extract(epoch from(now()-cooking_anchor))::integer); end if;
    next_status:='Stopped';event_label:='Cooking Stopped';event_action:='cooking_stopped';
    update public.gbgs_orders set production_status=next_status,production_stopped_at=now(),production_elapsed_seconds=cooking_elapsed,
      production_stop_reason=trim(p_reason),production_stopped_by=actor where id=p_order_id;
  elsif action_name='complete' or action_name='complete_cooking' then
    if current_order.production_status not in ('Cooking','Paused','Stopped') then raise exception 'Only cooking can be completed'; end if;
    if current_order.production_status='Cooking' then cooking_elapsed:=cooking_elapsed+greatest(0,extract(epoch from(now()-cooking_anchor))::integer); end if;
    next_status:='Awaiting Packaging';event_label:='Cooking Completed';event_action:='cooking_completed';
    update public.gbgs_orders set production_status=next_status,cooking_completed_at=now(),production_completed_at=null,
      production_elapsed_seconds=cooking_elapsed where id=p_order_id;
  elsif action_name='start_packaging' then
    if current_order.production_status<>'Awaiting Packaging' then raise exception 'Packaging can only start after cooking is completed'; end if;
    next_status:='Packaging';event_label:='Packaging Started';event_action:='packaging_started';
    update public.gbgs_orders set order_status='Packaging' where id=p_order_id;
    update public.gbgs_orders set production_status=next_status,packaging_started_at=coalesce(packaging_started_at,now()),
      packaging_resumed_at=now(),packaging_paused_at=null where id=p_order_id;
  elsif action_name='complete_packaging' then
    if current_order.production_status<>'Packaging' then raise exception 'Only active packaging can be completed'; end if;
    packaging_elapsed:=packaging_elapsed+greatest(0,extract(epoch from(now()-packaging_anchor))::integer);
    next_status:=case when lower(coalesce(current_order.delivery_method,'pickup'))='delivery' then 'Ready For Delivery' else 'Ready For Pickup' end;
    event_label:='Packaging Completed';event_action:='packaging_completed';
    update public.gbgs_orders set order_status='Ready' where id=p_order_id;
    update public.gbgs_orders set production_status=next_status,packaging_completed_at=now(),packaging_elapsed_seconds=packaging_elapsed where id=p_order_id;
  else
    raise exception 'Unsupported production action: %',p_action;
  end if;

  insert into public.gbgs_order_workflow_events(
    business_id,order_id,status,label,event_type,action,user_id,reason,elapsed_seconds,created_at
  ) values (
    p_business_id,p_order_id,next_status,event_label,event_label,event_action,actor,
    nullif(trim(coalesce(p_reason,'')),''),
    case when action_name in ('start_packaging','complete_packaging') then packaging_elapsed else cooking_elapsed end,now()
  );
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
declare order_row public.gbgs_orders%rowtype;customer_row public.gbgs_customers%rowtype;title text;severity text:='info';message text;
begin
  select * into order_row from public.gbgs_orders where id=new.order_id;
  select * into customer_row from public.gbgs_customers where id=order_row.customer_id;
  title:=case new.label
    when 'Cooking Started' then 'Production Started'
    when 'Cooking Paused' then 'Production Paused'
    when 'Cooking Resumed' then 'Production Resumed'
    when 'Cooking Stopped' then 'Production Stopped'
    when 'Packaging Started' then 'Packaging Required'
    when 'Packaging Completed' then 'Packaging Completed'
    when 'Production Reopened' then 'Production Reopened'
    else null end;
  if title is not null then
    severity:=case when title='Production Stopped' then 'critical' when title in('Production Paused','Packaging Required') then 'warning' when title='Packaging Completed' then 'success' else 'info' end;
    message:=case when title='Packaging Required' then
      'Packaging required for '||trim(concat_ws(' ',customer_row.first_name,customer_row.last_name))||' - Order '||order_row.order_number||'. Meals have finished cooking and are ready to be packaged.'
      else title||case when new.reason is not null then ': '||new.reason else '.' end end;
    perform public.gbgs_create_notification(new.business_id,'Kitchen',title,
      message,
      new.order_id,order_row.customer_id,severity,new.user_id);
  end if;
  return new;
end $$;

drop trigger if exists gbgs_workflow_create_notification on public.gbgs_order_workflow_events;
create trigger gbgs_workflow_create_notification after insert on public.gbgs_order_workflow_events
for each row execute function public.gbgs_notify_production_event();

-- Workflow communications remain persisted, but their mirror must not create a
-- second notification for Kitchen state transitions.
create or replace function public.gbgs_communication_notification()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='Queued' and coalesce(new.workflow_event,'') not in (
    'Production Started','Production Paused','Production Resumed','Production Stopped','Production Completed',
    'Cooking Started','Cooking Paused','Cooking Resumed','Cooking Stopped','Cooking Completed',
    'Packaging Started','Packaging Completed','Packaging Complete'
  ) then
    perform public.gbgs_create_notification(new.business_id,
      case when new.communication_type='Driver' then 'Deliveries' when new.communication_type='Internal' then 'Kitchen' else 'Orders' end,
      case when new.communication_type='Driver' then 'Driver Notified' when new.communication_type='Email' then 'Customer Email Queued' when new.communication_type='SMS' then 'Customer SMS Queued' else new.subject end,
      new.recipient_name||': '||new.subject,new.order_id,new.customer_id,'info',new.created_by);
  end if;
  return new;
end $$;

drop trigger if exists gbgs_communications_create_notification on public.gbgs_communications;
create trigger gbgs_communications_create_notification after insert on public.gbgs_communications
for each row execute function public.gbgs_communication_notification();
