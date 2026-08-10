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

  if new.production_status='Cooking'
    and (tg_op='INSERT' or old.production_status is distinct from 'Cooking') then
    new.production_started_at:=coalesce(new.production_started_at,now());
    new.production_resumed_at:=coalesce(new.production_resumed_at,now());
  end if;

  return new;
end $$;

update public.gbgs_orders
set production_started_at=now(),production_resumed_at=now()
where production_status='Cooking'
  and production_started_at is null
  and production_resumed_at is null;
