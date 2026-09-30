-- Optional exact facility addresses for commercial-truck routing.
-- Nullable and non-destructive: existing opportunities remain city/state/ZIP-only.
alter table public.gbgs_load_opportunities
  add column if not exists origin_street_address text,
  add column if not exists destination_street_address text;
