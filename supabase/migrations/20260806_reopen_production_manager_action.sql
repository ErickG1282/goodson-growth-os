create or replace function public.gbgs_reopen_production_order(
  p_business_id uuid,
  p_order_id uuid,
  p_reason text
) returns void language plpgsql security invoker set search_path=public as $$
declare
  current_order public.gbgs_orders%rowtype;
  actor uuid:=auth.uid();
  clean_reason text:=nullif(trim(coalesce(p_reason,'')),'');
begin
  if actor is null or not exists(
    select 1 from public.gbgs_business_members
    where business_id=p_business_id and user_id=actor
      and lower(coalesce(role,'')) in ('owner','admin','manager')
  ) then raise exception 'Manager permission is required to reopen production'; end if;
  if clean_reason is null then raise exception 'A reopen reason is required'; end if;

  select * into current_order from public.gbgs_orders
  where id=p_order_id and business_id=p_business_id for update;
  if current_order.id is null then raise exception 'Order does not belong to this business'; end if;
  if current_order.production_status<>'Packaging' then raise exception 'Only completed production in Packaging can be reopened'; end if;

  update public.gbgs_orders set
    production_status='Waiting',
    order_status='Cooking',
    production_completed_at=null
  where id=p_order_id;

  insert into public.gbgs_order_workflow_events(
    business_id,order_id,status,label,user_id,reason,elapsed_seconds
  ) values(
    p_business_id,p_order_id,'Waiting','Production Reopened',actor,clean_reason,
    coalesce(current_order.production_elapsed_seconds,0)
  );
end $$;

revoke all on function public.gbgs_reopen_production_order(uuid,uuid,text) from public;
grant execute on function public.gbgs_reopen_production_order(uuid,uuid,text) to authenticated;
