-- ============================================================
-- BEN OS FOUNDATION
-- Berhane Abraha Business Operating System
-- Created: 2026-09-30
-- ============================================================

-- Organizations are the top-level owner of Ben OS data.
-- This keeps Berhane's operating system separated from GBGS
-- and allows the architecture to support other clients later.

create table if not exists public.ben_organizations (
    id uuid primary key default gen_random_uuid(),

    name text not null,
    owner_name text not null,

    status text not null default 'active'
        check (status in ('active', 'inactive')),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);


-- ============================================================
-- ORGANIZATION MEMBERS
-- Controls who belongs to an organization and their role.
-- ============================================================

create table if not exists public.ben_organization_members (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null
        references public.ben_organizations(id)
        on delete cascade,

    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    role text not null default 'viewer'
        check (role in (
            'owner',
            'admin',
            'manager',
            'staff',
            'viewer'
        )),

    created_at timestamptz not null default now(),

    unique (organization_id, user_id)
);


-- Helpful lookup indexes

create index if not exists ben_org_members_organization_idx
    on public.ben_organization_members(organization_id);

create index if not exists ben_org_members_user_idx
    on public.ben_organization_members(user_id);