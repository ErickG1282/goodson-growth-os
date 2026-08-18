create table if not exists public.gbgs_life_daily_priorities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  priority_date date not null,
  position smallint not null,
  priority_text text not null default '',
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gbgs_life_daily_priorities_position_check check (position between 1 and 3),
  constraint gbgs_life_daily_priorities_user_date_position_key unique (user_id, priority_date, position)
);

create index if not exists gbgs_life_daily_priorities_user_date_idx
  on public.gbgs_life_daily_priorities(user_id, priority_date);

alter table public.gbgs_life_daily_priorities enable row level security;

drop policy if exists "Users manage their own daily priorities"
  on public.gbgs_life_daily_priorities;
create policy "Users manage their own daily priorities"
  on public.gbgs_life_daily_priorities
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
