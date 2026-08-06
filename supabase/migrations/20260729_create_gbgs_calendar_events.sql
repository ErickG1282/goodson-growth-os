create table if not exists public.gbgs_calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  event_date date not null,
  start_time time,
  end_time time,
  location text,
  notes text,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text,
  source_id uuid,
  category text
);

create index if not exists gbgs_calendar_events_user_id_idx
  on public.gbgs_calendar_events(user_id);
create index if not exists gbgs_calendar_events_event_date_idx
  on public.gbgs_calendar_events(event_date);
create index if not exists gbgs_calendar_events_source_idx
  on public.gbgs_calendar_events(source, source_id);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'gbgs_calendar_events'
      and policyname = 'Users manage their own calendar events'
  ) then
    create policy "Users manage their own calendar events"
      on public.gbgs_calendar_events for all to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
