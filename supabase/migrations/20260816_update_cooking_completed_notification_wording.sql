create or replace function public.gbgs_notify_production_event()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  notification_title text;
  notification_severity text:='info';
  notification_message text;
  order_row public.gbgs_orders%rowtype;
begin
  select * into order_row from public.gbgs_orders where id=new.order_id;

  if lower(coalesce(new.label,'')) in ('production completed','cooking completed') then
    insert into public.gbgs_notifications(
      business_id,category,title,message,related_order_id,
      related_customer_id,severity,is_read,created_by
    ) values (
      new.business_id,'Kitchen','Cooking Completed — Packaging Stage',
      'Cooking is complete. Order is ready to begin packaging.',
      new.order_id,order_row.customer_id,'warning',false,new.user_id
    );
    return new;
  end if;

  notification_title:=case
    when lower(coalesce(new.label,''))='packaging started' then 'Packaging Started'
    when lower(coalesce(new.label,'')) in ('packaging completed','packaging complete') then 'Packaging Completed'
    when lower(coalesce(new.label,'')) like '%reopened%' then 'Production Reopened'
    when lower(coalesce(new.label,'')) like '%started%' then 'Production Started'
    when lower(coalesce(new.label,'')) like '%paused%' then 'Production Paused'
    when lower(coalesce(new.label,'')) like '%resumed%' then 'Production Resumed'
    when lower(coalesce(new.label,'')) like '%stopped%' then 'Production Stopped'
    else null
  end;

  if notification_title is not null then
    notification_severity:=case
      when notification_title='Production Stopped' then 'critical'
      when notification_title='Production Paused' then 'warning'
      else 'info'
    end;
    notification_message:=notification_title||
      case when new.reason is not null then ': '||new.reason else '.' end;
    perform public.gbgs_create_notification(
      new.business_id,'Kitchen',notification_title,notification_message,
      new.order_id,order_row.customer_id,notification_severity,new.user_id
    );
  end if;
  return new;
end $$;
