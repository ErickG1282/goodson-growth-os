-- ============================================================
-- BEN OS: Financials
-- Financial transactions across all businesses
-- ============================================================

create table if not exists public.ben_financial_transactions (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null
        references public.ben_organizations(id)
        on delete cascade,

    business_id uuid
        references public.ben_businesses(id)
        on delete set null,

    transaction_type text not null
        check (transaction_type in (
            'income',
            'expense'
        )),

    category text,
    description text,

    amount numeric(14,2) not null
        check (amount >= 0),

    transaction_date date not null default current_date,

    status text not null default 'completed'
        check (status in (
            'pending',
            'completed',
            'cancelled'
        )),

    notes text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ============================================================
-- Money owed to Ben / Accounts Receivable
-- ============================================================

create table if not exists public.ben_receivables (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null
        references public.ben_organizations(id)
        on delete cascade,

    business_id uuid
        references public.ben_businesses(id)
        on delete set null,

    customer_name text not null,

    description text,

    amount_due numeric(14,2) not null
        check (amount_due >= 0),

    amount_paid numeric(14,2) not null default 0
        check (amount_paid >= 0),

    due_date date,

    status text not null default 'open'
        check (status in (
            'open',
            'partial',
            'paid',
            'overdue',
            'cancelled'
        )),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ============================================================
-- Upcoming bills / Accounts Payable
-- ============================================================

create table if not exists public.ben_bills (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null
        references public.ben_organizations(id)
        on delete cascade,

    business_id uuid
        references public.ben_businesses(id)
        on delete set null,

    vendor_name text not null,

    description text,

    amount numeric(14,2) not null
        check (amount >= 0),

    due_date date not null,

    status text not null default 'upcoming'
        check (status in (
            'upcoming',
            'due',
            'overdue',
            'paid',
            'cancelled'
        )),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ============================================================
-- Lookup indexes
-- ============================================================

create index if not exists ben_financial_transactions_org_idx
    on public.ben_financial_transactions(organization_id);

create index if not exists ben_financial_transactions_business_idx
    on public.ben_financial_transactions(business_id);

create index if not exists ben_financial_transactions_date_idx
    on public.ben_financial_transactions(transaction_date);

create index if not exists ben_receivables_org_idx
    on public.ben_receivables(organization_id);

create index if not exists ben_receivables_business_idx
    on public.ben_receivables(business_id);

create index if not exists ben_receivables_due_date_idx
    on public.ben_receivables(due_date);

create index if not exists ben_bills_org_idx
    on public.ben_bills(organization_id);

create index if not exists ben_bills_business_idx
    on public.ben_bills(business_id);

create index if not exists ben_bills_due_date_idx
    on public.ben_bills(due_date);