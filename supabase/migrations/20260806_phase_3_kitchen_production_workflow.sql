alter table public.gbgs_orders
  add column if not exists production_status text not null default 'Waiting',
  add column if not exists production_started_at timestamptz,
  add column if not exists production_paused_at timestamptz,
  add column if not exists production_resumed_at timestamptz,
  add column if not exists production_completed_at timestamptz,
  add column if not exists production_stopped_at timestamptz,
  add column if not exists production_elapsed_seconds integer not null default 0,
  add column if not exists production_stop_reason text,
  add column if not exists production_stopped_by uuid references auth.users(id);

alter table public.gbgs_orders drop constraint if exists gbgs_orders_production_status_check;
alter table public.gbgs_orders add constraint gbgs_orders_production_status_check
  check (production_status in ('Waiting','Cooking','Paused','Stopped','Packaging','Ready For Pickup','Completed'));
alter table public.gbgs_orders drop constraint if exists gbgs_orders_production_elapsed_check;
alter table public.gbgs_orders add constraint gbgs_orders_production_elapsed_check check (production_elapsed_seconds >= 0);

update public.gbgs_orders set production_status=case
  when lower(order_status) in ('completed','delivered') then 'Completed'
  when lower(order_status) in ('ready','ready for pickup','out for delivery') then 'Ready For Pickup'
  when lower(order_status)='packaging' then 'Packaging'
  when lower(order_status) in ('cooking','preparing') then 'Cooking'
  else 'Waiting' end;

create or replace function public.gbgs_sync_order_production_status()
returns trigger language plpgsql set search_path=public as $$ begin
  new.production_status:=case
    when lower(new.order_status) in ('completed','delivered') then 'Completed'
    when lower(new.order_status) in ('ready','ready for pickup','out for delivery') then 'Ready For Pickup'
    when lower(new.order_status)='packaging' then 'Packaging'
    when lower(new.order_status) in ('cooking','preparing') then 'Cooking'
    else new.production_status end;
  return new;
end $$;
drop trigger if exists gbgs_orders_sync_production_status on public.gbgs_orders;
create trigger gbgs_orders_sync_production_status before insert or update of order_status on public.gbgs_orders
for each row execute function public.gbgs_sync_order_production_status();

alter table public.gbgs_order_workflow_events
  add column if not exists user_id uuid references auth.users(id),
  add column if not exists reason text,
  add column if not exists elapsed_seconds integer not null default 0;

create or replace function public.gbgs_transition_production_order(
  p_business_id uuid,
  p_order_id uuid,
  p_action text,
  p_reason text default null
)
returns void language plpgsql security invoker set search_path=public as $$
declare
  current_order public.gbgs_orders%rowtype;
  action_name text:=lower(trim(p_action));
  next_production_status text;
  next_order_status text;
  next_elapsed integer;
  actor uuid:=auth.uid();
  event_label text;
  anchor_time timestamptz;
begin
  select * into current_order from public.gbgs_orders
  where id=p_order_id and business_id=p_business_id for update;
  if current_order.id is null then raise exception 'Order does not belong to this business'; end if;

  next_elapsed:=coalesce(current_order.production_elapsed_seconds,0);
  anchor_time:=coalesce(current_order.production_resumed_at,current_order.production_started_at,now());

  if action_name='start' then
    if current_order.production_status<>'Waiting' then raise exception 'Only waiting production can be started'; end if;
    next_production_status:='Cooking'; next_order_status:='Cooking'; event_label:='Production Started';
    update public.gbgs_orders set production_status=next_production_status,order_status=next_order_status,
      production_started_at=coalesce(production_started_at,now()),production_resumed_at=now(),
      production_paused_at=null,production_stopped_at=null,production_stop_reason=null,production_stopped_by=null
    where id=p_order_id;
  elsif action_name='pause' then
    if current_order.production_status<>'Cooking' then raise exception 'Only cooking production can be paused'; end if;
    next_production_status:='Paused'; event_label:='Production Paused';
    next_elapsed:=next_elapsed+greatest(0,extract(epoch from(now()-anchor_time))::integer);
    update public.gbgs_orders set production_status=next_production_status,production_paused_at=now(),
      production_elapsed_seconds=next_elapsed where id=p_order_id;
  elsif action_name='resume' then
    if current_order.production_status<>'Paused' then raise exception 'Only paused production can be resumed'; end if;
    next_production_status:='Cooking'; event_label:='Production Resumed';
    update public.gbgs_orders set production_status=next_production_status,production_resumed_at=now(),
      production_paused_at=production_paused_at where id=p_order_id;
  elsif action_name='stop' then
    if current_order.production_status not in ('Cooking','Paused') then raise exception 'Only active production can be stopped'; end if;
    if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'A stop reason is required'; end if;
    next_production_status:='Stopped'; event_label:='Production Stopped';
    if current_order.production_status='Cooking' then next_elapsed:=next_elapsed+greatest(0,extract(epoch from(now()-anchor_time))::integer); end if;
    update public.gbgs_orders set production_status=next_production_status,production_stopped_at=now(),
      production_elapsed_seconds=next_elapsed,production_stop_reason=trim(p_reason),production_stopped_by=actor
    where id=p_order_id;
  elsif action_name='complete' then
    if current_order.production_status not in ('Cooking','Paused') then raise exception 'Only active production can be completed'; end if;
    next_production_status:='Packaging'; next_order_status:='Packaging'; event_label:='Production Completed';
    if current_order.production_status='Cooking' then next_elapsed:=next_elapsed+greatest(0,extract(epoch from(now()-anchor_time))::integer); end if;
    update public.gbgs_orders set production_status=next_production_status,order_status=next_order_status,
      production_completed_at=now(),production_elapsed_seconds=next_elapsed
    where id=p_order_id;
  else raise exception 'Unsupported production action: %',p_action;
  end if;

  insert into public.gbgs_order_workflow_events(business_id,order_id,status,label,user_id,reason,elapsed_seconds)
  values(p_business_id,p_order_id,next_production_status,event_label,actor,nullif(trim(coalesce(p_reason,'')),''),next_elapsed);
end $$;

revoke all on function public.gbgs_transition_production_order(uuid,uuid,text,text) from public;
grant execute on function public.gbgs_transition_production_order(uuid,uuid,text,text) to authenticated;
