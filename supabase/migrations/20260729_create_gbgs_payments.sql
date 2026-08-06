create sequence if not exists public.gbgs_payment_number_seq start 1001;

create table if not exists public.gbgs_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.gbgs_businesses(id) on delete cascade,
  order_id uuid not null references public.gbgs_orders(id) on delete cascade,
  customer_id uuid references public.gbgs_customers(id) on delete set null,
  invoice_number text not null,
  payment_number text not null unique default ('PAY-' || lpad(nextval('public.gbgs_payment_number_seq')::text, 6, '0')),
  payment_date timestamptz not null default now(),
  payment_method text not null check (payment_method in ('Cash', 'Credit Card', 'Debit Card', 'Cash App', 'Zelle', 'Venmo', 'PayPal', 'Square')),
  amount numeric(12,2) not null check (amount > 0),
  transaction_number text,
  internal_notes text,
  status text not null default 'Completed' check (status in ('Completed', 'Refunded')),
  parent_payment_id uuid references public.gbgs_payments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gbgs_payments_business_id_idx on public.gbgs_payments(business_id);
create index if not exists gbgs_payments_order_id_idx on public.gbgs_payments(order_id);
create index if not exists gbgs_payments_customer_id_idx on public.gbgs_payments(customer_id);
create index if not exists gbgs_payments_payment_date_idx on public.gbgs_payments(payment_date);

alter table public.gbgs_payments enable row level security;

create policy "Authenticated users manage Miz Rita payments"
  on public.gbgs_payments for all to authenticated
  using (true) with check (true);

alter publication supabase_realtime add table public.gbgs_payments;
