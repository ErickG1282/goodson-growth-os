create table if not exists public.gbgs_life_daily_faith (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record_date date not null,
  scripture_reference text not null default '',
  scripture_text text not null default '',
  faith_focus text not null default '',
  faith_notes text not null default '',
  devotion_notes text not null default '',
  prayer_completed boolean not null default false,
  prayer_completed_at timestamptz,
  devotion_completed boolean not null default false,
  devotion_completed_at timestamptz,
  gratitude_completed boolean not null default false,
  gratitude_completed_at timestamptz,
  reflection_grateful text not null default '',
  reflection_learned text not null default '',
  reflection_surrender text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gbgs_life_daily_faith_user_date_key unique(user_id, record_date),
  constraint gbgs_life_daily_faith_id_user_key unique(id, user_id)
);

create table if not exists public.gbgs_life_faith_gratitude_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  daily_faith_id uuid not null,
  gratitude_text text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gbgs_life_faith_gratitude_daily_user_fkey foreign key(daily_faith_id,user_id) references public.gbgs_life_daily_faith(id,user_id) on delete cascade,
  constraint gbgs_life_faith_gratitude_text_check check(length(trim(gratitude_text))>0),
  constraint gbgs_life_faith_gratitude_sort_check check(sort_order between 0 and 2),
  constraint gbgs_life_faith_gratitude_position_key unique(daily_faith_id,sort_order)
);

create table if not exists public.gbgs_life_faith_prayers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  details text not null default '',
  status text not null default 'Active',
  prayer_date date not null default current_date,
  answered_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gbgs_life_faith_prayers_title_check check(length(trim(title))>0),
  constraint gbgs_life_faith_prayers_status_check check(status in('Active','Answered','Archived')),
  constraint gbgs_life_faith_prayers_answered_check check(status='Answered' or answered_date is null)
);

create table if not exists public.gbgs_life_faith_commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  target_date date,
  status text not null default 'Active',
  priority text not null default 'Normal',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gbgs_life_faith_commitments_title_check check(length(trim(title))>0),
  constraint gbgs_life_faith_commitments_status_check check(status in('Active','Completed','Paused')),
  constraint gbgs_life_faith_commitments_priority_check check(priority in('Low','Normal','High'))
);

create index if not exists gbgs_life_daily_faith_user_date_idx on public.gbgs_life_daily_faith(user_id,record_date desc);
create index if not exists gbgs_life_faith_gratitude_daily_idx on public.gbgs_life_faith_gratitude_items(daily_faith_id,sort_order);
create index if not exists gbgs_life_faith_prayers_user_status_idx on public.gbgs_life_faith_prayers(user_id,status,created_at desc);
create index if not exists gbgs_life_faith_commitments_user_status_date_idx on public.gbgs_life_faith_commitments(user_id,status,target_date);
create index if not exists gbgs_life_faith_commitments_priority_idx on public.gbgs_life_faith_commitments(user_id,priority) where status='Active';

alter table public.gbgs_life_daily_faith enable row level security;
alter table public.gbgs_life_faith_gratitude_items enable row level security;
alter table public.gbgs_life_faith_prayers enable row level security;
alter table public.gbgs_life_faith_commitments enable row level security;

drop policy if exists "Users manage their own daily faith" on public.gbgs_life_daily_faith;
create policy "Users manage their own daily faith" on public.gbgs_life_daily_faith for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists "Users manage their own faith gratitude" on public.gbgs_life_faith_gratitude_items;
create policy "Users manage their own faith gratitude" on public.gbgs_life_faith_gratitude_items for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists "Users manage their own faith prayers" on public.gbgs_life_faith_prayers;
create policy "Users manage their own faith prayers" on public.gbgs_life_faith_prayers for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists "Users manage their own faith commitments" on public.gbgs_life_faith_commitments;
create policy "Users manage their own faith commitments" on public.gbgs_life_faith_commitments for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
