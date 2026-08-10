create table if not exists public.gbgs_communications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.gbgs_businesses(id) on delete cascade,
  order_id uuid references public.gbgs_orders(id) on delete cascade,
  customer_id uuid references public.gbgs_customers(id) on delete set null,
  driver_id uuid,
  workflow_event text not null default 'Manual',
  communication_type text not null,
  recipient_name text,
  recipient_email text,
  recipient_phone text,
  status text not null default 'Queued',
  subject text not null,
  message text not null,
  provider text not null default 'Internal Queue',
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  constraint gbgs_communications_type_check check (
    communication_type in ('Email','SMS','Push','Internal','Driver','Customer','WhatsApp')
  ),
  constraint gbgs_communications_status_check check (
    status in ('Queued','Sent','Delivered','Failed','Cancelled')
  )
);

alter table public.gbgs_communications add column if not exists order_id uuid references public.gbgs_orders(id) on delete cascade;
alter table public.gbgs_communications add column if not exists customer_id uuid references public.gbgs_customers(id) on delete set null;
alter table public.gbgs_communications add column if not exists driver_id uuid;
alter table public.gbgs_communications add column if not exists workflow_event text not null default 'Manual';
alter table public.gbgs_communications add column if not exists updated_at timestamptz not null default now();
alter table public.gbgs_communications add column if not exists sent_at timestamptz;
alter table public.gbgs_communications add column if not exists delivered_at timestamptz;
alter table public.gbgs_communications add column if not exists failed_at timestamptz;
alter table public.gbgs_communications add column if not exists error_message text;
alter table public.gbgs_communications add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists gbgs_communications_business_created_idx
  on public.gbgs_communications(business_id,created_at desc);
create index if not exists gbgs_communications_order_idx
  on public.gbgs_communications(order_id,created_at);
create index if not exists gbgs_communications_customer_idx
  on public.gbgs_communications(customer_id);
create index if not exists gbgs_communications_status_idx
  on public.gbgs_communications(business_id,status);
create index if not exists gbgs_communications_type_idx
  on public.gbgs_communications(business_id,communication_type);

alter table public.gbgs_communications enable row level security;

drop policy if exists "Authenticated users manage Miz Rita communications"
  on public.gbgs_communications;
create policy "Authenticated users manage Miz Rita communications"
  on public.gbgs_communications
  for all
  to authenticated
  using (true)
  with check (true);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='gbgs_communications'
  ) then
    alter publication supabase_realtime add table public.gbgs_communications;
  end if;
end $$;
