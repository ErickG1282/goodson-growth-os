create unique index if not exists gbgs_notifications_one_active_packaging_required
  on public.gbgs_notifications(business_id,related_order_id,title)
  where title='Packaging Required' and not is_read;
create unique index if not exists gbgs_notifications_one_active_delivery_ready
  on public.gbgs_notifications(business_id,related_order_id,title)
  where title='Delivery Ready' and not is_read;

update public.gbgs_notifications set is_read=true
where title in('Production Completed','Packaging Ready') and not is_read;

create or replace function public.gbgs_notify_production_event() returns trigger language plpgsql security definer set search_path=public as $$
declare event_title text;event_severity text:='info';o public.gbgs_orders%rowtype;c public.gbgs_customers%rowtype;
begin
  select * into o from public.gbgs_orders where id=new.order_id;select * into c from public.gbgs_customers where id=o.customer_id;
  if lower(new.label) like '%completed%' or lower(new.status)='packaging' then
    insert into public.gbgs_notifications(business_id,category,title,message,related_order_id,related_customer_id,severity,is_read,created_by)
    values(new.business_id,'Kitchen','Packaging Required','Packaging required for '||trim(concat_ws(' ',c.first_name,c.last_name))||' - Order '||o.order_number||'. '||coalesce(o.meal_count,0)||' meals have finished cooking and are ready to be packaged.',o.id,o.customer_id,'warning',false,new.user_id)
    on conflict(business_id,related_order_id,title) where title='Packaging Required' and not is_read do nothing;
    return new;
  end if;
  event_title:=case when lower(new.label) like '%reopened%' then 'Production Reopened' when lower(new.label) like '%started%' then 'Production Started' when lower(new.label) like '%paused%' then 'Production Paused' when lower(new.label) like '%resumed%' then 'Production Resumed' when lower(new.label) like '%stopped%' then 'Production Stopped' end;
  if event_title is not null then event_severity:=case when event_title='Production Stopped' then 'critical' when event_title='Production Paused' then 'warning' else 'info' end;perform public.gbgs_create_notification(new.business_id,'Kitchen',event_title,event_title||case when new.reason is not null then ': '||new.reason else '.' end,new.order_id,o.customer_id,event_severity,new.user_id);end if;return new;
end $$;

create or replace function public.gbgs_notify_delivery_updates() returns trigger language plpgsql security definer set search_path=public as $$
declare o public.gbgs_orders%rowtype;c public.gbgs_customers%rowtype;timing text;
begin
  select * into o from public.gbgs_orders where id=new.order_id;select * into c from public.gbgs_customers where id=o.customer_id;
  if new.driver_name is not null and(tg_op='INSERT' or old.driver_name is distinct from new.driver_name) then perform public.gbgs_create_notification(new.business_id,'Deliveries','Driver Assigned','Driver: '||new.driver_name||'.',new.order_id,o.customer_id,'warning',auth.uid());end if;
  if(tg_op='INSERT' or old.status is distinct from new.status)and lower(new.status)='ready' then
    update public.gbgs_notifications set is_read=true where business_id=new.business_id and related_order_id=new.order_id and title='Packaging Required' and not is_read;
    timing:=case when new.scheduled_at is not null then ' Scheduled: '||to_char(new.scheduled_at,'Mon DD, YYYY FMHH12:MI AM')||'.' else '' end;
    insert into public.gbgs_notifications(business_id,category,title,message,related_order_id,related_customer_id,severity,is_read,created_by)
    values(new.business_id,'Deliveries','Delivery Ready',trim(concat_ws(' ',c.first_name,c.last_name))||'''s order is packaged and ready for '||lower(coalesce(new.delivery_type,'Pickup'))||'. '||coalesce(o.meal_count,0)||' meals.'||timing,o.id,o.customer_id,'info',false,coalesce(auth.uid(),o.created_by))
    on conflict(business_id,related_order_id,title) where title='Delivery Ready' and not is_read do nothing;
  end if;
  if(tg_op='INSERT' or old.status is distinct from new.status)and lower(new.status)='delivered' then perform public.gbgs_create_notification(new.business_id,'Deliveries','Delivery Completed','Delivery completed.',new.order_id,o.customer_id,'success',auth.uid());end if;return new;
end $$;
