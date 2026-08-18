-- Phase 1 Part 2: Update order sync function to include business_id for future events
-- This ensures all new/updated order-derived calendar events receive the correct business_id

create or replace function public.gbgs_sync_order_calendar_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare event_user_id uuid;
begin
  if new.fulfillment_date is null then
    delete from public.gbgs_calendar_events where source = 'Order' and source_id = new.id;
    return new;
  end if;
  event_user_id := coalesce(new.created_by, (
    select member.user_id from public.gbgs_business_members member
    where member.business_id = new.business_id
    order by case lower(coalesce(member.role, '')) when 'owner' then 0 when 'admin' then 1 else 2 end,
      member.created_at, member.id limit 1
  ));
  if event_user_id is null then
    raise exception 'Cannot create fulfillment calendar event: order has no creator and business has no member';
  end if;
  update public.gbgs_calendar_events set
    user_id = event_user_id,
    business_id = new.business_id,
    title = coalesce(new.delivery_method, 'Pickup') || ' - ' || new.order_number,
    event_date = new.fulfillment_date,
    start_time = time '12:00',
    end_time = null,
    location = null,
    notes = new.notes,
    completed = lower(new.order_status) in ('completed', 'delivered'),
    category = 'Fulfillment',
    updated_at = now()
  where source = 'Order' and source_id = new.id;
  if not found then
    insert into public.gbgs_calendar_events
      (user_id, business_id, title, event_date, start_time, end_time, location, notes, completed, source, source_id, category)
    values
      (event_user_id, new.business_id, coalesce(new.delivery_method, 'Pickup') || ' - ' || new.order_number,
       new.fulfillment_date, time '12:00', null, null, new.notes,
       lower(new.order_status) in ('completed', 'delivered'), 'Order', new.id, 'Fulfillment');
  end if;
  return new;
end $$;
