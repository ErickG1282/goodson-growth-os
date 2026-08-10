create table if not exists public.gbgs_communication_settings (
  id uuid primary key default gen_random_uuid(), business_id uuid not null unique references public.gbgs_businesses(id) on delete cascade,
  customer_emails boolean not null default true, customer_sms boolean not null default false,
  driver_notifications boolean not null default true, kitchen_notifications boolean not null default true,
  internal_notifications boolean not null default true, future_push_notifications boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.gbgs_communication_templates (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.gbgs_businesses(id) on delete cascade,
  workflow_event text not null, communication_type text not null, audience text not null,
  subject text not null, message text not null, is_enabled boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(business_id,workflow_event,communication_type,audience)
);

create table if not exists public.gbgs_communications (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.gbgs_businesses(id) on delete cascade,
  order_id uuid references public.gbgs_orders(id) on delete cascade, customer_id uuid references public.gbgs_customers(id) on delete set null,
  driver_id uuid, workflow_event text not null, communication_type text not null check(communication_type in('Email','SMS','Push','Internal','Driver','Customer','WhatsApp')),
  recipient_name text, recipient_email text, recipient_phone text, subject text not null, message text not null,
  status text not null default 'Queued' check(status in('Queued','Sent','Delivered','Failed','Cancelled')),
  provider text not null default 'Internal Queue', provider_message_id text,
  created_at timestamptz not null default now(), sent_at timestamptz, delivered_at timestamptz, failed_at timestamptz,
  error_message text, created_by uuid references auth.users(id) on delete set null
);

create index if not exists gbgs_communications_business_created_idx on public.gbgs_communications(business_id,created_at desc);
create index if not exists gbgs_communications_order_idx on public.gbgs_communications(order_id,created_at);
create index if not exists gbgs_communications_customer_idx on public.gbgs_communications(customer_id);
create index if not exists gbgs_communications_status_idx on public.gbgs_communications(business_id,status);
create index if not exists gbgs_communication_templates_business_idx on public.gbgs_communication_templates(business_id,workflow_event);

alter table public.gbgs_communications enable row level security;
alter table public.gbgs_communication_templates enable row level security;
alter table public.gbgs_communication_settings enable row level security;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='gbgs_communications' and policyname='Authenticated users manage Miz Rita communications') then create policy "Authenticated users manage Miz Rita communications" on public.gbgs_communications for all to authenticated using(true) with check(true); end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='gbgs_communication_templates' and policyname='Authenticated users manage Miz Rita communication templates') then create policy "Authenticated users manage Miz Rita communication templates" on public.gbgs_communication_templates for all to authenticated using(true) with check(true); end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='gbgs_communication_settings' and policyname='Authenticated users manage Miz Rita communication settings') then create policy "Authenticated users manage Miz Rita communication settings" on public.gbgs_communication_settings for all to authenticated using(true) with check(true); end if;
end $$;

insert into public.gbgs_communication_settings(business_id) select id from public.gbgs_businesses where slug='miz-ritas-kitchen' on conflict(business_id) do nothing;

insert into public.gbgs_communication_templates(business_id,workflow_event,communication_type,audience,subject,message)
select b.id,v.event,v.channel,v.audience,v.subject,v.message from public.gbgs_businesses b cross join(values
('Order Received','Email','Customer','Order Confirmed','Hello {{customer_name}},\n\nThank you for your order.\n\nOrder: {{order_number}}\n{{meal_count}} Meals\n\nPickup: {{pickup_time}}\n\nWe''ll keep you updated throughout production.\n\n{{business_name}}'),
('Order Received','SMS','Customer','Order Confirmed','{{business_name}}: Order {{order_number}} for {{meal_count}} meals is confirmed. Pickup: {{pickup_time}}.'),
('Production Started','Email','Customer','Your Meals Are Being Prepared','Hello {{customer_name}}, your meals for order {{order_number}} are now being prepared.'),
('Production Started','Internal','Kitchen','Production Started','Production started for {{customer_name}}, order {{order_number}}, {{meal_count}} meals.'),
('Production Paused','Internal','Kitchen','Production Paused','Production paused for {{customer_name}}, order {{order_number}}.'),
('Production Resumed','Internal','Kitchen','Production Resumed','Production resumed for {{customer_name}}, order {{order_number}}.'),
('Production Stopped','Internal','Kitchen','Production Stopped','Production stopped for {{customer_name}}, order {{order_number}}.'),
('Production Completed','Email','Customer','Your Meals Have Been Packaged','Hello {{customer_name}}, your meals for order {{order_number}} have been packaged.'),
('Production Completed','Internal','Kitchen','Production Completed','Production completed for {{customer_name}}, order {{order_number}}.'),
('Production Reopened','Internal','Kitchen','Production Reopened','Production reopened for {{customer_name}}, order {{order_number}}.'),
('Packaging Started','Internal','Kitchen','Packaging Started','Packaging started for {{customer_name}}, order {{order_number}}.'),
('Packaging Complete','Internal','Kitchen','Packaging Complete','Packaging completed for {{customer_name}}, order {{order_number}}.'),
('Ready','Email','Customer','Your Meals Are Ready','Hello {{customer_name}}, order {{order_number}} is ready. Pickup: {{pickup_time}}. {{business_name}} {{business_phone}} {{business_email}}'),
('Out For Delivery','Email','Customer','Your Order Is On The Way','Hello {{customer_name}}, order {{order_number}} is on the way with {{driver_name}}. Estimated arrival: {{delivery_time}}.'),
('Delivered','Email','Customer','Your Meals Have Been Delivered','Hello {{customer_name}}, order {{order_number}} has been delivered.'),
('Driver Assigned','Driver','Driver','Driver Assignment','Customer: {{customer_name}}\nOrder: {{order_number}}\nAddress: {{tracking_link}}\nPhone: {{business_phone}}\nMeals: {{meal_count}}\nPickup: {{pickup_time}}'),
('Ready','Driver','Driver','Order Ready For Pickup','Order {{order_number}} for {{customer_name}} is ready for pickup.'),
('Out For Delivery','Driver','Driver','Delivery Started','Delivery started for {{customer_name}}, order {{order_number}}.'),
('Delivered','Driver','Driver','Delivery Complete','Delivery completed for {{customer_name}}, order {{order_number}}.'),
('Low Inventory','Internal','Kitchen','Low Inventory','Inventory requires attention: {{tracking_link}}.'),
('Inventory Blocking Production','Internal','Kitchen','Inventory Blocking Production','Production is blocked by inventory: {{tracking_link}}.')
) as v(event,channel,audience,subject,message) where b.slug='miz-ritas-kitchen'
on conflict(business_id,workflow_event,communication_type,audience) do nothing;

create or replace function public.gbgs_render_communication_template(p_text text,p_order public.gbgs_orders,p_customer public.gbgs_customers,p_delivery public.gbgs_deliveries,p_business_name text default 'Miz Rita''s Kitchen')
returns text language sql stable set search_path=public as $$ select replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(coalesce(p_text,''),'{{customer_name}}',trim(concat_ws(' ',p_customer.first_name,p_customer.last_name))),'{{order_number}}',coalesce(p_order.order_number,'')),'{{meal_count}}',coalesce(p_order.meal_count,0)::text),'{{pickup_time}}',coalesce(to_char(p_delivery.scheduled_at,'FMDay FMHH12:MI AM'),coalesce(p_order.fulfillment_date::text,'Not scheduled'))),'{{delivery_time}}',coalesce(to_char(p_delivery.scheduled_at,'FMHH12:MI AM'),'Not scheduled')),'{{driver_name}}',coalesce(p_delivery.driver_name,'Not assigned')),'{{tracking_link}}',coalesce(p_delivery.address,'')),'{{business_name}}',p_business_name),'{{business_phone}}',''),'{{business_email}}','') $$;

create or replace function public.gbgs_queue_communication(p_business_id uuid,p_order_id uuid,p_workflow_event text,p_communication_type text,p_audience text,p_created_by uuid default null,p_context text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare o public.gbgs_orders%rowtype;c public.gbgs_customers%rowtype;d public.gbgs_deliveries%rowtype;t public.gbgs_communication_templates%rowtype;s public.gbgs_communication_settings%rowtype;queued_id uuid;allowed boolean:=false;recipient text;email text;phone text;
begin
  select * into t from public.gbgs_communication_templates where business_id=p_business_id and workflow_event=p_workflow_event and communication_type=p_communication_type and audience=p_audience and is_enabled limit 1;if t.id is null then return null;end if;
  select * into s from public.gbgs_communication_settings where business_id=p_business_id;if s.id is null then insert into public.gbgs_communication_settings(business_id) values(p_business_id) returning * into s;end if;
  allowed:=case when p_communication_type='Email' then s.customer_emails when p_communication_type='SMS' then s.customer_sms when p_communication_type='Driver' then s.driver_notifications when p_audience='Kitchen' then s.kitchen_notifications else s.internal_notifications end;if not allowed then return null;end if;
  if p_order_id is not null then select * into o from public.gbgs_orders where id=p_order_id and business_id=p_business_id;select * into c from public.gbgs_customers where id=o.customer_id;select * into d from public.gbgs_deliveries where order_id=o.id;end if;
  recipient:=case when p_audience='Driver' then coalesce(d.driver_name,'Unassigned Driver') when p_audience='Kitchen' then 'Kitchen Team' else trim(concat_ws(' ',c.first_name,c.last_name)) end;email:=case when p_audience='Customer' then c.email end;phone:=case when p_audience='Driver' then d.driver_phone when p_audience='Customer' then c.phone end;
  insert into public.gbgs_communications(business_id,order_id,customer_id,workflow_event,communication_type,recipient_name,recipient_email,recipient_phone,subject,message,status,provider,created_by)
  values(p_business_id,o.id,c.id,p_workflow_event,p_communication_type,recipient,email,phone,public.gbgs_render_communication_template(t.subject,o,c,d),case when p_context is not null then public.gbgs_render_communication_template(t.message,o,c,d)||' '||p_context else public.gbgs_render_communication_template(t.message,o,c,d) end,'Queued','Internal Queue',coalesce(p_created_by,auth.uid())) returning id into queued_id;return queued_id;
end $$;

create or replace function public.gbgs_communication_from_order() returns trigger language plpgsql security definer set search_path=public as $$ begin perform public.gbgs_queue_communication(new.business_id,new.id,'Order Received','Email','Customer',new.created_by);perform public.gbgs_queue_communication(new.business_id,new.id,'Order Received','SMS','Customer',new.created_by);return new;end $$;
drop trigger if exists gbgs_orders_queue_communications on public.gbgs_orders;create trigger gbgs_orders_queue_communications after insert on public.gbgs_orders for each row execute function public.gbgs_communication_from_order();

create or replace function public.gbgs_communication_from_workflow() returns trigger language plpgsql security definer set search_path=public as $$
declare event_name text:=case when lower(new.label) like '%reopened%' then 'Production Reopened' when lower(new.label) like '%started%' and lower(new.label) like '%packag%' then 'Packaging Started' when lower(new.label) like '%started%' then 'Production Started' when lower(new.label) like '%paused%' then 'Production Paused' when lower(new.label) like '%resumed%' then 'Production Resumed' when lower(new.label) like '%stopped%' then 'Production Stopped' when lower(new.label) like '%completed%' or lower(new.status)='packaging' then 'Production Completed' end;
begin if event_name is null then return new;end if;perform public.gbgs_queue_communication(new.business_id,new.order_id,event_name,'Internal','Kitchen',new.user_id,new.reason);if event_name in('Production Started','Production Completed') then perform public.gbgs_queue_communication(new.business_id,new.order_id,event_name,'Email','Customer',new.user_id);perform public.gbgs_queue_communication(new.business_id,new.order_id,event_name,'SMS','Customer',new.user_id);end if;if event_name='Production Completed' then perform public.gbgs_queue_communication(new.business_id,new.order_id,'Packaging Complete','Internal','Kitchen',new.user_id);end if;return new;end $$;
drop trigger if exists gbgs_workflow_queue_communications on public.gbgs_order_workflow_events;create trigger gbgs_workflow_queue_communications after insert on public.gbgs_order_workflow_events for each row execute function public.gbgs_communication_from_workflow();

create or replace function public.gbgs_communication_from_delivery() returns trigger language plpgsql security definer set search_path=public as $$
declare event_name text;
begin if new.driver_name is not null and(tg_op='INSERT' or old.driver_name is distinct from new.driver_name) then perform public.gbgs_queue_communication(new.business_id,new.order_id,'Driver Assigned','Driver','Driver',auth.uid());end if;if tg_op='INSERT' or old.status is distinct from new.status then event_name:=case lower(new.status) when 'ready' then 'Ready' when 'out for delivery' then 'Out For Delivery' when 'delivered' then 'Delivered' end;if event_name is not null then perform public.gbgs_queue_communication(new.business_id,new.order_id,event_name,'Email','Customer',auth.uid());perform public.gbgs_queue_communication(new.business_id,new.order_id,event_name,'SMS','Customer',auth.uid());perform public.gbgs_queue_communication(new.business_id,new.order_id,event_name,'Driver','Driver',auth.uid());end if;end if;return new;end $$;
drop trigger if exists gbgs_deliveries_queue_communications on public.gbgs_deliveries;create trigger gbgs_deliveries_queue_communications after insert or update of status,driver_name on public.gbgs_deliveries for each row execute function public.gbgs_communication_from_delivery();

create or replace function public.gbgs_communication_from_inventory() returns trigger language plpgsql security definer set search_path=public as $$ begin if new.is_active and new.quantity<=new.par_level and(tg_op='INSERT' or old.quantity>old.par_level) then perform public.gbgs_queue_communication(new.business_id,null,'Low Inventory','Internal','Kitchen',auth.uid(),new.name||' '||new.quantity||'/'||new.par_level||' '||new.unit);end if;return new;end $$;
drop trigger if exists gbgs_inventory_queue_communications on public.gbgs_inventory_items;create trigger gbgs_inventory_queue_communications after insert or update of quantity on public.gbgs_inventory_items for each row execute function public.gbgs_communication_from_inventory();

create or replace function public.gbgs_communication_notification() returns trigger language plpgsql security definer set search_path=public as $$ begin if new.status='Queued' then perform public.gbgs_create_notification(new.business_id,case when new.communication_type='Driver' then 'Deliveries' when new.communication_type='Internal' then 'Kitchen' else 'Orders' end,case when new.communication_type='Driver' then 'Driver Notified' when new.communication_type='Email' then 'Customer Email Queued' when new.communication_type='SMS' then 'Customer SMS Queued' else new.subject end,new.recipient_name||': '||new.subject,new.order_id,new.customer_id,'info',new.created_by);end if;return new;end $$;
drop trigger if exists gbgs_communications_create_notification on public.gbgs_communications;create trigger gbgs_communications_create_notification after insert on public.gbgs_communications for each row execute function public.gbgs_communication_notification();

grant execute on function public.gbgs_queue_communication(uuid,uuid,text,text,text,uuid,text) to authenticated;
do $$ begin if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='gbgs_communications') then alter publication supabase_realtime add table public.gbgs_communications;end if;end $$;
