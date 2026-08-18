-- Phase 1: Add business_id to gbgs_calendar_events for proper business isolation
-- This migration adds nullable business_id to enable separate client operating systems
-- to properly scope calendar events by business.

alter table if exists public.gbgs_calendar_events
add column if not exists business_id uuid null references public.gbgs_businesses(id) on delete set null;

-- Add indexes for business-scoped queries
create index if not exists gbgs_calendar_events_business_user_date_idx
  on public.gbgs_calendar_events(business_id, user_id, event_date);

create index if not exists gbgs_calendar_events_business_source_idx
  on public.gbgs_calendar_events(business_id, source, source_id);

-- Safe backfill: Populate business_id for order-derived calendar events
-- Only events whose source is 'Order' and source_id matches a legitimate gbgs_orders.id
-- will be backfilled with the order's business_id.
update public.gbgs_calendar_events ce
set business_id = o.business_id
from public.gbgs_orders o
where ce.source = 'Order'
  and ce.source_id = o.id
  and ce.business_id is null
  and o.business_id is not null;

-- Future order-derived calendar events will receive business_id through the sync trigger.
-- Manual events without a source/source_id relationship remain business_id = NULL
-- until they are manually reviewed and classified.
