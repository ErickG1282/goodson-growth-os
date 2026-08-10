alter table public.gbgs_orders
  add column if not exists cooking_completed_at timestamptz,
  add column if not exists packaging_started_at timestamptz,
  add column if not exists packaging_resumed_at timestamptz,
  add column if not exists packaging_elapsed_seconds integer not null default 0;

alter table public.gbgs_orders drop constraint if exists gbgs_orders_production_status_check;
alter table public.gbgs_orders add constraint gbgs_orders_production_status_check check (
  production_status in ('Waiting','Cooking','Paused','Stopped','Awaiting Packaging','Packaging','Ready For Pickup','Ready For Delivery','Completed')
);

create or replace function public.gbgs_transition_production_order(
  p_business_id uuid,p_order_id uuid,p_action text,p_reason text default null
) returns void language plpgsql security invoker set search_path=public as $$
declare
  current_order public.gbgs_orders%rowtype;
  action_name text:=lower(trim(p_action));
  next_production_status text;
  next_order_status text;
  next_elapsed integer;
  actor uuid:=auth.uid();
  event_label text;
  event_action text;
  anchor_time timestamptz;
begin
  select * into current_order from public.gbgs_orders
  where id=p_order_id and business_id=p_business_id for update;
  if current_order.id is null then raise exception 'Order does not belong to this business'; end if;

  next_elapsed:=coalesce(current_order.production_elapsed_seconds,0);
  anchor_time:=coalesce(current_order.production_resumed_at,current_order.production_started_at,now());

  if action_name='start' then
    if current_order.production_status<>'Waiting' then raise exception 'Only waiting production can be started'; end if;
    next_production_status:='Cooking';next_order_status:='Cooking';event_label:='Production Started';event_action:='cooking_started';
    update public.gbgs_orders set production_status=next_production_status,order_status=next_order_status,
      production_started_at=coalesce(production_started_at,now()),production_resumed_at=now(),
      production_paused_at=null,production_stopped_at=null,production_stop_reason=null,production_stopped_by=null
    where id=p_order_id;
  elsif action_name='pause' then
    if current_order.production_status<>'Cooking' then raise exception 'Only cooking production can be paused'; end if;
    next_production_status:='Paused';event_label:='Production Paused';event_action:='cooking_paused';
    next_elapsed:=next_elapsed+greatest(0,extract(epoch from(now()-anchor_time))::integer);
    update public.gbgs_orders set production_status=next_production_status,production_paused_at=now(),production_elapsed_seconds=next_elapsed where id=p_order_id;
  elsif action_name='resume' then
    if current_order.production_status not in ('Paused','Stopped') then raise exception 'Only paused or stopped production can be resumed'; end if;
    next_production_status:='Cooking';event_label:='Production Resumed';event_action:='cooking_resumed';
    update public.gbgs_orders set production_status=next_production_status,production_resumed_at=now(),
      production_stopped_at=null,production_stop_reason=null,production_stopped_by=null where id=p_order_id;
  elsif action_name='stop' then
    if current_order.production_status not in ('Cooking','Paused') then raise exception 'Only active production can be stopped'; end if;
    if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'A stop reason is required'; end if;
    next_production_status:='Stopped';event_label:='Production Stopped';event_action:='cooking_stopped';
    if current_order.production_status='Cooking' then next_elapsed:=next_elapsed+greatest(0,extract(epoch from(now()-anchor_time))::integer); end if;
    update public.gbgs_orders set production_status=next_production_status,production_stopped_at=now(),production_elapsed_seconds=next_elapsed,
      production_stop_reason=trim(p_reason),production_stopped_by=actor where id=p_order_id;
  elsif action_name in ('complete','complete_cooking') then
    if current_order.production_status not in ('Cooking','Paused') then raise exception 'Only active production can be completed'; end if;
    next_production_status:='Awaiting Packaging';event_label:='Production Completed';event_action:='cooking_completed';
    if current_order.production_status='Cooking' then next_elapsed:=next_elapsed+greatest(0,extract(epoch from(now()-anchor_time))::integer); end if;
    update public.gbgs_orders set production_status=next_production_status,cooking_completed_at=now(),production_completed_at=now(),
      production_elapsed_seconds=next_elapsed where id=p_order_id;
  elsif action_name='start_packaging' then
    if current_order.production_status<>'Awaiting Packaging' then raise exception 'Packaging can only start after cooking is completed'; end if;
    next_production_status:='Packaging';next_order_status:='Packaging';event_label:='Packaging Started';event_action:='packaging_started';
    update public.gbgs_orders set production_status=next_production_status,order_status=next_order_status,
      packaging_started_at=coalesce(packaging_started_at,now()),packaging_resumed_at=now() where id=p_order_id;
  else
    raise exception 'Unsupported production action: %',p_action;
  end if;

  insert into public.gbgs_order_workflow_events(
    business_id,order_id,status,label,event_type,action,user_id,reason,elapsed_seconds,created_at
  ) values(
    p_business_id,p_order_id,next_production_status,event_label,event_label,event_action,actor,
    nullif(trim(coalesce(p_reason,'')),''),next_elapsed,now()
  );
end $$;

revoke all on function public.gbgs_transition_production_order(uuid,uuid,text,text) from public;
grant execute on function public.gbgs_transition_production_order(uuid,uuid,text,text) to authenticated;

create or replace function public.gbgs_reopen_production_order(
  p_business_id uuid,p_order_id uuid,p_reason text
) returns void language plpgsql security invoker set search_path=public as $$
declare current_order public.gbgs_orders%rowtype;actor uuid:=auth.uid();clean_reason text:=nullif(trim(coalesce(p_reason,'')),'');
begin
  if actor is null or not exists(select 1 from public.gbgs_business_members where business_id=p_business_id and user_id=actor and lower(coalesce(role,'')) in ('owner','admin','manager')) then raise exception 'Manager permission is required to reopen production'; end if;
  if clean_reason is null then raise exception 'A reopen reason is required'; end if;
  select * into current_order from public.gbgs_orders where id=p_order_id and business_id=p_business_id for update;
  if current_order.id is null then raise exception 'Order does not belong to this business'; end if;
  if current_order.production_status<>'Awaiting Packaging' then raise exception 'Only completed cooking awaiting packaging can be reopened'; end if;
  update public.gbgs_orders set production_status='Waiting',order_status='Cooking',production_completed_at=null,cooking_completed_at=null where id=p_order_id;
  insert into public.gbgs_order_workflow_events(business_id,order_id,status,label,event_type,action,user_id,reason,elapsed_seconds,created_at)
  values(p_business_id,p_order_id,'Waiting','Production Reopened','Production Reopened','reopened',actor,clean_reason,coalesce(current_order.production_elapsed_seconds,0),now());
end $$;

revoke all on function public.gbgs_reopen_production_order(uuid,uuid,text) from public;
grant execute on function public.gbgs_reopen_production_order(uuid,uuid,text) to authenticated;
