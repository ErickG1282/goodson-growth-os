create table if not exists public.gbgs_life_goals (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  goal_name text not null, category text not null default 'Personal', description text not null default '', why_it_matters text not null default '',
  start_date date not null default current_date, target_date date, progress_percent smallint not null default 0,
  status text not null default 'Active', notes text not null default '', completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint gbgs_life_goals_id_user_key unique(id,user_id),
  constraint gbgs_life_goals_name_check check(length(trim(goal_name))>0),
  constraint gbgs_life_goals_progress_check check(progress_percent between 0 and 100),
  constraint gbgs_life_goals_status_check check(status in('Active','Completed','Paused','Cancelled'))
);
create table if not exists public.gbgs_life_goal_actions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null, action_title text not null, action_date date not null, scheduled_time time, priority text not null default 'Medium',
  status text not null default 'Planned', notes text not null default '', estimated_minutes integer, actual_minutes integer,
  calendar_event_id uuid unique references public.gbgs_calendar_events(id) on delete set null, completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint gbgs_life_goal_actions_id_user_key unique(id,user_id),
  constraint gbgs_life_goal_actions_goal_user_fkey foreign key(goal_id,user_id) references public.gbgs_life_goals(id,user_id) on delete cascade,
  constraint gbgs_life_goal_actions_title_check check(length(trim(action_title))>0),
  constraint gbgs_life_goal_actions_priority_check check(priority in('High','Medium','Low')),
  constraint gbgs_life_goal_actions_status_check check(status in('Planned','Completed','Skipped')),
  constraint gbgs_life_goal_actions_minutes_check check((estimated_minutes is null or estimated_minutes>=0) and (actual_minutes is null or actual_minutes>=0))
);
create table if not exists public.gbgs_life_goal_milestones (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null, milestone_title text not null, target_date date, status text not null default 'Not Started', completion_date date,
  sort_order smallint not null default 0, notes text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint gbgs_life_goal_milestones_goal_user_fkey foreign key(goal_id,user_id) references public.gbgs_life_goals(id,user_id) on delete cascade,
  constraint gbgs_life_goal_milestones_title_check check(length(trim(milestone_title))>0),
  constraint gbgs_life_goal_milestones_status_check check(status in('Not Started','In Progress','Completed'))
);
create table if not exists public.gbgs_life_goal_progress_history (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null, progress_percent smallint not null, recorded_date date not null default current_date, notes text not null default '', created_at timestamptz not null default now(),
  constraint gbgs_life_goal_progress_goal_user_fkey foreign key(goal_id,user_id) references public.gbgs_life_goals(id,user_id) on delete cascade,
  constraint gbgs_life_goal_progress_percent_check check(progress_percent between 0 and 100),
  constraint gbgs_life_goal_progress_unique unique(goal_id,recorded_date,progress_percent)
);
create table if not exists public.gbgs_life_goal_notes (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null, note_type text not null default 'Note', content text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint gbgs_life_goal_notes_goal_user_fkey foreign key(goal_id,user_id) references public.gbgs_life_goals(id,user_id) on delete cascade,
  constraint gbgs_life_goal_notes_type_check check(note_type in('Note','Obstacle','Win','Next Step')),
  constraint gbgs_life_goal_notes_content_check check(length(trim(content))>0)
);
create index if not exists gbgs_life_goals_user_status_idx on public.gbgs_life_goals(user_id,status,target_date);
create index if not exists gbgs_life_goal_actions_user_date_idx on public.gbgs_life_goal_actions(user_id,action_date,priority,status);
create index if not exists gbgs_life_goal_actions_goal_idx on public.gbgs_life_goal_actions(goal_id,action_date desc);
create index if not exists gbgs_life_goal_milestones_goal_idx on public.gbgs_life_goal_milestones(goal_id,sort_order,target_date);
create index if not exists gbgs_life_goal_progress_goal_date_idx on public.gbgs_life_goal_progress_history(goal_id,recorded_date);
create index if not exists gbgs_life_goal_notes_goal_idx on public.gbgs_life_goal_notes(goal_id,note_type,created_at desc);
alter table public.gbgs_life_goals enable row level security;
alter table public.gbgs_life_goal_actions enable row level security;
alter table public.gbgs_life_goal_milestones enable row level security;
alter table public.gbgs_life_goal_progress_history enable row level security;
alter table public.gbgs_life_goal_notes enable row level security;
drop policy if exists "Users manage their own life goals" on public.gbgs_life_goals;
create policy "Users manage their own life goals" on public.gbgs_life_goals for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists "Users manage their own goal actions" on public.gbgs_life_goal_actions;
create policy "Users manage their own goal actions" on public.gbgs_life_goal_actions for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists "Users manage their own goal milestones" on public.gbgs_life_goal_milestones;
create policy "Users manage their own goal milestones" on public.gbgs_life_goal_milestones for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists "Users manage their own goal progress" on public.gbgs_life_goal_progress_history;
create policy "Users manage their own goal progress" on public.gbgs_life_goal_progress_history for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists "Users manage their own goal notes" on public.gbgs_life_goal_notes;
create policy "Users manage their own goal notes" on public.gbgs_life_goal_notes for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
