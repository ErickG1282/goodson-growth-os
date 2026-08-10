alter table public.gbgs_order_workflow_events
  add column if not exists event_type text,
  add column if not exists action text;

create index if not exists gbgs_workflow_events_reopen_idx
  on public.gbgs_order_workflow_events(business_id,order_id,created_at desc)
  where action='reopened';
