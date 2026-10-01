-- Ben OS security only. Requires PostgreSQL 15+ and trusted postgres migration role.
-- Initial organizations/owners and owner changes require trusted provisioning.
-- All members read organizations, rosters, and businesses.
-- Financial CRUD requires owner/admin/manager; staff/viewer have no financial-table access.
-- Owners manage non-owners; admins manage lower roles.
BEGIN;

CREATE SCHEMA ben_private;
REVOKE ALL ON SCHEMA ben_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA ben_private TO authenticated;

-- Only returns the caller's own role; postgres bypass avoids membership recursion.
CREATE FUNCTION ben_private.organization_role(target_organization_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT m.role FROM public.ben_organization_members AS m
    WHERE m.organization_id = target_organization_id
      AND m.user_id = (SELECT auth.uid())
$$;
ALTER FUNCTION ben_private.organization_role(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION ben_private.organization_role(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ben_private.organization_role(uuid) TO authenticated;

-- Prevent tenant transfers, even for a user who belongs to both organizations.
CREATE FUNCTION ben_private.prevent_identity_change()
RETURNS trigger LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
        RAISE EXCEPTION 'Ben OS identity and organization are immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_TABLE_NAME = 'ben_organization_members' THEN
        IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
            RAISE EXCEPTION 'Ben OS membership user is immutable' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION ben_private.prevent_identity_change() FROM PUBLIC, anon, authenticated;

-- Unknown permissive policies could widen access through OR; fail closed.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('ben_organizations', 'ben_organization_members', 'ben_businesses', 'ben_financial_transactions', 'ben_receivables', 'ben_bills')
    ) THEN
        RAISE EXCEPTION 'Existing Ben OS policies require review before migration';
    END IF;
END;
$$;

-- Financial business references must belong to the same tenant.
-- Constraint validation rejects existing cross-tenant references.
ALTER TABLE public.ben_businesses
    ADD CONSTRAINT ben_businesses_org_id_unique UNIQUE (organization_id, id);

ALTER TABLE public.ben_organizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ben_organizations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ben_organizations TO authenticated;

ALTER TABLE public.ben_organization_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ben_organization_members FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ben_organization_members TO authenticated;
CREATE TRIGGER ben_organization_members_immutable_identity BEFORE UPDATE ON public.ben_organization_members
    FOR EACH ROW EXECUTE FUNCTION ben_private.prevent_identity_change();

ALTER TABLE public.ben_businesses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ben_businesses FROM PUBLIC, anon, authenticated;
-- Supabase membership roles all use the authenticated database role.
-- Table-wide SELECT would expose financial columns regardless of membership role.
-- Clear any pre-existing column SELECT grants as well as the table grant above.
REVOKE SELECT (id, organization_id, name, business_type, status, description,
    ownership_percentage, monthly_revenue, monthly_expenses, created_at, updated_at)
    ON TABLE public.ben_businesses FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, organization_id, name, business_type, status, description,
    created_at, updated_at) ON TABLE public.ben_businesses TO authenticated;
-- RLS still limits all writes to owner/admin/manager.
GRANT INSERT, UPDATE, DELETE ON TABLE public.ben_businesses TO authenticated;
CREATE TRIGGER ben_businesses_immutable_identity BEFORE UPDATE ON public.ben_businesses
    FOR EACH ROW EXECUTE FUNCTION ben_private.prevent_identity_change();

ALTER TABLE public.ben_financial_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ben_financial_transactions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ben_financial_transactions TO authenticated;
CREATE TRIGGER ben_financial_transactions_immutable_identity BEFORE UPDATE ON public.ben_financial_transactions
    FOR EACH ROW EXECUTE FUNCTION ben_private.prevent_identity_change();

ALTER TABLE public.ben_receivables ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ben_receivables FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ben_receivables TO authenticated;
CREATE TRIGGER ben_receivables_immutable_identity BEFORE UPDATE ON public.ben_receivables
    FOR EACH ROW EXECUTE FUNCTION ben_private.prevent_identity_change();

ALTER TABLE public.ben_bills ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ben_bills FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ben_bills TO authenticated;
CREATE TRIGGER ben_bills_immutable_identity BEFORE UPDATE ON public.ben_bills
    FOR EACH ROW EXECUTE FUNCTION ben_private.prevent_identity_change();

ALTER TABLE public.ben_financial_transactions
    ADD CONSTRAINT ben_financial_transactions_organization_business_fk
    FOREIGN KEY (organization_id, business_id)
    REFERENCES public.ben_businesses (organization_id, id)
    ON DELETE SET NULL (business_id);

ALTER TABLE public.ben_receivables
    ADD CONSTRAINT ben_receivables_organization_business_fk
    FOREIGN KEY (organization_id, business_id)
    REFERENCES public.ben_businesses (organization_id, id)
    ON DELETE SET NULL (business_id);

ALTER TABLE public.ben_bills
    ADD CONSTRAINT ben_bills_organization_business_fk
    FOREIGN KEY (organization_id, business_id)
    REFERENCES public.ben_businesses (organization_id, id)
    ON DELETE SET NULL (business_id);

-- Organization primary keys cannot be changed by client updates.
REVOKE UPDATE ON TABLE public.ben_organizations FROM authenticated;
GRANT UPDATE (name, owner_name, status, updated_at)
    ON TABLE public.ben_organizations TO authenticated;

CREATE POLICY ben_organizations_select ON public.ben_organizations
    FOR SELECT TO authenticated USING (ben_private.organization_role(id) IS NOT NULL);
-- No INSERT policy: organization bootstrap requires trusted provisioning.
CREATE POLICY ben_organizations_update ON public.ben_organizations
    FOR UPDATE TO authenticated
    USING (ben_private.organization_role(id) IN ('owner', 'admin'))
    WITH CHECK (ben_private.organization_role(id) IN ('owner', 'admin'));
CREATE POLICY ben_organizations_delete ON public.ben_organizations
    FOR DELETE TO authenticated USING (ben_private.organization_role(id) = 'owner');

CREATE POLICY ben_organization_members_select ON public.ben_organization_members
    FOR SELECT TO authenticated USING (ben_private.organization_role(organization_id) IS NOT NULL);
CREATE POLICY ben_organization_members_insert ON public.ben_organization_members
    FOR INSERT TO authenticated WITH CHECK (user_id <> (SELECT auth.uid()) AND (
        (ben_private.organization_role(organization_id) = 'owner'
            AND role IN ('admin', 'manager', 'staff', 'viewer'))
        OR (ben_private.organization_role(organization_id) = 'admin'
            AND role IN ('manager', 'staff', 'viewer'))
    ));
CREATE POLICY ben_organization_members_update ON public.ben_organization_members
    FOR UPDATE TO authenticated USING (user_id <> (SELECT auth.uid()) AND (
        (ben_private.organization_role(organization_id) = 'owner'
            AND role IN ('admin', 'manager', 'staff', 'viewer'))
        OR (ben_private.organization_role(organization_id) = 'admin'
            AND role IN ('manager', 'staff', 'viewer'))
    )) WITH CHECK (user_id <> (SELECT auth.uid()) AND (
        (ben_private.organization_role(organization_id) = 'owner'
            AND role IN ('admin', 'manager', 'staff', 'viewer'))
        OR (ben_private.organization_role(organization_id) = 'admin'
            AND role IN ('manager', 'staff', 'viewer'))
    ));
CREATE POLICY ben_organization_members_delete ON public.ben_organization_members
    FOR DELETE TO authenticated USING (user_id <> (SELECT auth.uid()) AND (
        (ben_private.organization_role(organization_id) = 'owner'
            AND role IN ('admin', 'manager', 'staff', 'viewer'))
        OR (ben_private.organization_role(organization_id) = 'admin'
            AND role IN ('manager', 'staff', 'viewer'))
    ));

CREATE POLICY ben_businesses_select ON public.ben_businesses
    FOR SELECT TO authenticated USING (ben_private.organization_role(organization_id) IS NOT NULL);

CREATE POLICY ben_businesses_insert ON public.ben_businesses
    FOR INSERT TO authenticated WITH CHECK (ben_private.organization_role(organization_id) IN ('owner', 'admin', 'manager'));

CREATE POLICY ben_businesses_update ON public.ben_businesses
    FOR UPDATE TO authenticated USING (ben_private.organization_role(organization_id) IN ('owner', 'admin', 'manager')) WITH CHECK (ben_private.organization_role(organization_id) IN ('owner', 'admin', 'manager'));

CREATE POLICY ben_businesses_delete ON public.ben_businesses
    FOR DELETE TO authenticated USING (ben_private.organization_role(organization_id) IN ('owner', 'admin', 'manager'));

CREATE POLICY ben_financial_transactions_select ON public.ben_financial_transactions
    FOR SELECT TO authenticated USING (ben_private.organization_role(organization_id) IN ('owner', 'admin', 'manager'));

CREATE POLICY ben_financial_transactions_insert ON public.ben_financial_transactions
    FOR INSERT TO authenticated WITH CHECK (ben_private.organization_role(organization_id) IN ('owner', 'admin', 'manager'));

CREATE POLICY ben_financial_transactions_update ON public.ben_financial_transactions
    FOR UPDATE TO authenticated USING (ben_private.organization_role(organization_id) IN ('owner', 'admin', 'manager')) WITH CHECK (ben_private.organization_role(organization_id) IN ('owner', 'admin', 'manager'));

CREATE POLICY ben_financial_transactions_delete ON public.ben_financial_transactions
    FOR DELETE TO authenticated USING (ben_private.organization_role(organization_id) IN ('owner', 'admin', 'manager'));

CREATE POLICY ben_receivables_select ON public.ben_receivables
    FOR SELECT TO authenticated USING (ben_private.organization_role(organization_id) IN ('owner', 'admin', 'manager'));

CREATE POLICY ben_receivables_insert ON public.ben_receivables
    FOR INSERT TO authenticated WITH CHECK (ben_private.organization_role(organization_id) IN ('owner', 'admin', 'manager'));

CREATE POLICY ben_receivables_update ON public.ben_receivables
    FOR UPDATE TO authenticated USING (ben_private.organization_role(organization_id) IN ('owner', 'admin', 'manager')) WITH CHECK (ben_private.organization_role(organization_id) IN ('owner', 'admin', 'manager'));

CREATE POLICY ben_receivables_delete ON public.ben_receivables
    FOR DELETE TO authenticated USING (ben_private.organization_role(organization_id) IN ('owner', 'admin', 'manager'));

CREATE POLICY ben_bills_select ON public.ben_bills
    FOR SELECT TO authenticated USING (ben_private.organization_role(organization_id) IN ('owner', 'admin', 'manager'));

CREATE POLICY ben_bills_insert ON public.ben_bills
    FOR INSERT TO authenticated WITH CHECK (ben_private.organization_role(organization_id) IN ('owner', 'admin', 'manager'));

CREATE POLICY ben_bills_update ON public.ben_bills
    FOR UPDATE TO authenticated USING (ben_private.organization_role(organization_id) IN ('owner', 'admin', 'manager')) WITH CHECK (ben_private.organization_role(organization_id) IN ('owner', 'admin', 'manager'));

CREATE POLICY ben_bills_delete ON public.ben_bills
    FOR DELETE TO authenticated USING (ben_private.organization_role(organization_id) IN ('owner', 'admin', 'manager'));


-- Read-only directory: explicit allowlist, caller's column privileges and RLS.
-- Future business columns are not automatically exposed by this view.
CREATE VIEW public.ben_business_directory
WITH (security_invoker = true, security_barrier = true)
AS
    SELECT id, organization_id, name, business_type, status, description,
        created_at, updated_at
    FROM public.ben_businesses;
REVOKE ALL ON TABLE public.ben_business_directory FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.ben_business_directory TO authenticated;

-- This is the only client read path for structured business financial figures.
-- Ownership percentage is treated as sensitive alongside revenue/expenses.
-- SECURITY DEFINER is necessary because clients lack SELECT on these columns.
-- It bypasses table RLS, so the caller-scoped tenant/role check is mandatory.
-- Unauthorized/non-member requests return no rows, never another tenant's data.
CREATE FUNCTION public.ben_business_financials(target_organization_id uuid)
RETURNS TABLE (
    id uuid,
    organization_id uuid,
    ownership_percentage numeric,
    monthly_revenue numeric,
    monthly_expenses numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT b.id, b.organization_id, b.ownership_percentage,
        b.monthly_revenue, b.monthly_expenses
    FROM public.ben_businesses AS b
    WHERE b.organization_id = target_organization_id
      AND ben_private.organization_role(target_organization_id)
          IN ('owner', 'admin', 'manager')
$$;
ALTER FUNCTION public.ben_business_financials(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.ben_business_financials(uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ben_business_financials(uuid) TO authenticated;

COMMIT;
