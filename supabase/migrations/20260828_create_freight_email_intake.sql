create table if not exists public.gbgs_incoming_load_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sender_name text, sender_email text not null, subject text not null default '', body_text text, body_html text,
  external_message_id text, received_at timestamptz not null,
  processing_status text not null default 'NEW' check (processing_status in ('NEW','PARSED','PARTIAL_REVIEW','NEEDS_REVIEW','ERROR')),
  processing_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index if not exists gbgs_incoming_load_emails_user_external_message_key
  on public.gbgs_incoming_load_emails(user_id, external_message_id) where external_message_id is not null;

create table if not exists public.gbgs_load_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_email_id uuid not null,
  opportunity_index integer not null check (opportunity_index >= 0),
  broker_name text, broker_contact_name text, broker_email text, broker_phone text, broker_load_number text,
  origin_city text, origin_state text, origin_zip text, destination_city text, destination_state text, destination_zip text,
  pickup_date date, pickup_time time, pickup_datetime_raw text, delivery_date date, delivery_time time, delivery_datetime_raw text,
  equipment_type text, trailer_length integer, door_type text, commodity text, weight_lbs integer,
  broker_reported_miles integer, calculated_miles integer, mileage_status text not null default 'NOT_CONFIGURED',
  broker_offered_rate numeric(12,2), special_instructions text, tracking_requirement text, quote_validity_minutes integer,
  extraction_status text not null check (extraction_status in ('READY_TO_QUOTE','NEEDS_REVIEW','ERROR')),
  extraction_confidence text not null check (extraction_confidence in ('HIGH','MEDIUM','LOW')),
  extraction_issues jsonb not null default '[]'::jsonb,
  raw_extracted_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (source_email_id, opportunity_index),
  constraint gbgs_load_opportunities_source_owner_fk foreign key (source_email_id, user_id)
    references public.gbgs_incoming_load_emails(id, user_id) on delete restrict
);

create table if not exists public.gbgs_load_opportunity_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  load_opportunity_id uuid not null,
  field_name text not null, previous_value jsonb, corrected_value jsonb,
  corrected_at timestamptz not null default now(),
  constraint gbgs_load_opportunity_corrections_owner_fk foreign key (load_opportunity_id, user_id)
    references public.gbgs_load_opportunities(id, user_id) on delete restrict
);

alter table public.gbgs_quote_requests add column if not exists source_opportunity_id uuid;
alter table public.gbgs_quote_requests add constraint gbgs_quote_requests_source_opportunity_owner_fk
  foreign key (source_opportunity_id, user_id) references public.gbgs_load_opportunities(id, user_id) on delete restrict;
create unique index if not exists gbgs_quote_requests_source_opportunity_key
  on public.gbgs_quote_requests(source_opportunity_id) where source_opportunity_id is not null;

create index if not exists gbgs_incoming_load_emails_user_received_idx on public.gbgs_incoming_load_emails(user_id, received_at desc);
create index if not exists gbgs_load_opportunities_user_created_idx on public.gbgs_load_opportunities(user_id, created_at desc);
create index if not exists gbgs_load_opportunities_status_idx on public.gbgs_load_opportunities(user_id, extraction_status);
create index if not exists gbgs_load_opportunity_corrections_opportunity_idx on public.gbgs_load_opportunity_corrections(load_opportunity_id, corrected_at);

alter table public.gbgs_incoming_load_emails enable row level security;
alter table public.gbgs_load_opportunities enable row level security;
alter table public.gbgs_load_opportunity_corrections enable row level security;

create policy "Users select their own incoming load emails" on public.gbgs_incoming_load_emails for select to authenticated using (auth.uid() = user_id);
create policy "Users insert their own incoming load emails" on public.gbgs_incoming_load_emails for insert to authenticated with check (auth.uid() = user_id);
create policy "Users update processing metadata on their incoming load emails" on public.gbgs_incoming_load_emails for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage their own load opportunities" on public.gbgs_load_opportunities for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users select their own opportunity corrections" on public.gbgs_load_opportunity_corrections for select to authenticated using (auth.uid() = user_id);
create policy "Users insert their own opportunity corrections" on public.gbgs_load_opportunity_corrections for insert to authenticated with check (auth.uid() = user_id);

create or replace function public.gbgs_email_intake_set_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace function public.gbgs_preserve_raw_load_email_evidence() returns trigger language plpgsql set search_path = public as $$
begin
  if new.sender_name is distinct from old.sender_name or new.sender_email is distinct from old.sender_email
    or new.subject is distinct from old.subject or new.body_text is distinct from old.body_text
    or new.body_html is distinct from old.body_html or new.external_message_id is distinct from old.external_message_id
    or new.received_at is distinct from old.received_at then
    raise exception 'Raw incoming email evidence is immutable';
  end if;
  return new;
end;
$$;

create or replace function public.gbgs_record_load_opportunity_corrections() returns trigger language plpgsql set search_path = public as $$
declare tracked_field text; old_values jsonb := to_jsonb(old); new_values jsonb := to_jsonb(new);
begin
  foreach tracked_field in array array['origin_city','origin_state','origin_zip','destination_city','destination_state','destination_zip','pickup_date','pickup_time','delivery_date','delivery_time','equipment_type','weight_lbs','broker_reported_miles','broker_offered_rate','commodity'] loop
    if (old_values -> tracked_field) is distinct from (new_values -> tracked_field) then
      insert into public.gbgs_load_opportunity_corrections (user_id, load_opportunity_id, field_name, previous_value, corrected_value)
      values (new.user_id, new.id, tracked_field, old_values -> tracked_field, new_values -> tracked_field);
    end if;
  end loop;
  return new;
end;
$$;

create trigger gbgs_incoming_load_emails_preserve_evidence before update on public.gbgs_incoming_load_emails for each row execute function public.gbgs_preserve_raw_load_email_evidence();
create trigger gbgs_incoming_load_emails_set_updated_at before update on public.gbgs_incoming_load_emails for each row execute function public.gbgs_email_intake_set_updated_at();
create trigger gbgs_load_opportunities_record_corrections before update on public.gbgs_load_opportunities for each row execute function public.gbgs_record_load_opportunity_corrections();
create trigger gbgs_load_opportunities_set_updated_at before update on public.gbgs_load_opportunities for each row execute function public.gbgs_email_intake_set_updated_at();

revoke execute on function public.gbgs_email_intake_set_updated_at() from public, anon, authenticated;
revoke execute on function public.gbgs_preserve_raw_load_email_evidence() from public, anon, authenticated;
revoke execute on function public.gbgs_record_load_opportunity_corrections() from public, anon, authenticated;
