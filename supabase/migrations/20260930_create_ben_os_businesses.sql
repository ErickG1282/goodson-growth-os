-- ============================================================
-- BEN OS: Businesses
-- Creates the businesses/assets managed inside an organization
-- ============================================================

create table if not exists public.ben_businesses (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null
        references public.ben_organizations(id)
        on delete cascade,

    name text not null,

    business_type text not null default 'other',

    status text not null default 'active'
        check (status in (
            'active',
            'inactive',
            'planning',
            'sold',
            'closed'
        )),

    description text,

    ownership_percentage numeric(5,2)
        check (
            ownership_percentage is null
            or (
                ownership_percentage >= 0
                and ownership_percentage <= 100
            )
        ),

    monthly_revenue numeric(14,2) not null default 0,
    monthly_expenses numeric(14,2) not null default 0,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (organization_id, name)
);

-- Helpful lookup indexes

create index if not exists ben_businesses_organization_id_idx
    on public.ben_businesses(organization_id);

create index if not exists ben_businesses_status_idx
    on public.ben_businesses(status);

create index if not exists ben_businesses_type_idx
    on public.ben_businesses(business_type);