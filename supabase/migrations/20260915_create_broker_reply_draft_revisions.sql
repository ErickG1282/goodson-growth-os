begin;

create table public.gbgs_broker_reply_draft_revisions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id) on delete restrict,
  quote_request_id uuid not null
    references public.gbgs_quote_requests(id) on delete restrict,
  source_opportunity_id uuid not null,
  source_email_id uuid not null,

  revision integer not null check (revision >= 1),
  previous_revision integer,

  action text not null
    check (action in ('GENERATED', 'EDITED', 'APPROVED')),
  draft_status text not null
    check (draft_status in ('DRAFT', 'APPROVED')),

  recipient_email text not null
    check (
      recipient_email ~
        '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    ),
  original_subject text not null,
  original_external_message_id text,
  reply_subject text not null
    check (
      length(btrim(reply_subject)) > 0
      and position(chr(10) in reply_subject) = 0
      and position(chr(13) in reply_subject) = 0
    ),
  reply_body text not null
    check (length(btrim(reply_body)) > 0),

  generated_by uuid not null
    references auth.users(id) on delete restrict,
  generated_at timestamptz not null default now(),
  recorded_by uuid not null
    references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),

  approved_by uuid
    references auth.users(id) on delete restrict,
  approved_at timestamptz,

  sending_status text not null default 'NOT_CONFIGURED'
    check (sending_status = 'NOT_CONFIGURED'),
  sent_at timestamptz check (sent_at is null),
  sending_error text check (sending_error is null),

  unique (quote_request_id, revision),

  foreign key (quote_request_id, previous_revision)
    references public.gbgs_broker_reply_draft_revisions
      (quote_request_id, revision)
    on delete restrict,

  foreign key (source_opportunity_id, user_id)
    references public.gbgs_load_opportunities(id, user_id)
    on delete restrict,

  foreign key (source_email_id, user_id)
    references public.gbgs_incoming_load_emails(id, user_id)
    on delete restrict,

  check (
    (
      action = 'GENERATED'
      and revision = 1
      and previous_revision is null
    )
    or
    (
      action in ('EDITED', 'APPROVED')
      and revision > 1
      and previous_revision is not null
      and previous_revision = revision - 1
    )
  ),

  check (
    (
      action in ('GENERATED', 'EDITED')
      and draft_status = 'DRAFT'
      and approved_by is null
      and approved_at is null
    )
    or
    (
      action = 'APPROVED'
      and draft_status = 'APPROVED'
      and approved_by is not null
      and approved_at is not null
      and approved_by = user_id
    )
  ),

  check (generated_by = user_id and recorded_by = user_id)
);

alter table public.gbgs_broker_reply_draft_revisions
  enable row level security;

revoke all on public.gbgs_broker_reply_draft_revisions
  from public, anon, authenticated;

grant select, insert
  on public.gbgs_broker_reply_draft_revisions
  to authenticated;

create policy broker_reply_revisions_select_owner
  on public.gbgs_broker_reply_draft_revisions
  for select to authenticated
  using (user_id = auth.uid());

create policy broker_reply_revisions_insert_owner
  on public.gbgs_broker_reply_draft_revisions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.gbgs_quote_requests q
      join public.gbgs_load_opportunities o
        on o.id = q.source_opportunity_id
        and o.user_id = q.user_id
      join public.gbgs_incoming_load_emails e
        on e.id = o.source_email_id
        and e.user_id = q.user_id
      where q.id =
        gbgs_broker_reply_draft_revisions.quote_request_id
        and q.user_id = auth.uid()
        and q.source = 'Email'
        and o.id =
          gbgs_broker_reply_draft_revisions.source_opportunity_id
        and e.id =
          gbgs_broker_reply_draft_revisions.source_email_id
    )
  );

commit;
