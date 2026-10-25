-- ============================================================================
-- SightB · apply the company ledger (one-off, CLAUDE.md rule 4 exception)
--
-- Paste ALL of this into Lovable Cloud's SQL editor and run it once.
-- Safe to run again: every object is created only if missing.
-- The last statement returns ONE row: "✅ ready" or what is missing.
-- Needs the second factor (20260924150000, 20260926120000), live since
-- 26 September. The row also names any SECURITY DEFINER function a user may
-- call that does not ask for it.
-- Source: supabase/migrations/20261016120000_company_ledger.sql
-- ============================================================================

-- Company ledger: company expenses (salaries, incentives, owners' pay, rent,
-- government fees), their explicit allocation to projects, and advances
-- between the company, its projects and people. Design and the owner's
-- decisions: docs/company-ledger-design.md.
--
-- Idempotent: every object is created only if missing, so the block can be
-- run again safely. Policies use the company scope and never select from
-- their own table (42P17, see roadmap 2026-10-07).

-- ── parties: people and vendors known to the company ─────────────────────
CREATE TABLE IF NOT EXISTS public.parties (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(btrim(name)) > 0),
  kind        text NOT NULL DEFAULT 'person' CHECK (kind IN ('person', 'owner', 'vendor')),
  archived    boolean NOT NULL DEFAULT false,
  user_id     uuid NOT NULL DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS parties_company_idx ON public.parties (company_id);

-- ── company_expenses: spend that belongs to the company itself ───────────
CREATE TABLE IF NOT EXISTS public.company_expenses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  date              date NOT NULL,
  amount            numeric(14,2) NOT NULL CHECK (amount > 0),
  description       text NOT NULL DEFAULT '',
  kind              text NOT NULL DEFAULT 'other' CHECK (kind IN (
                      'salary', 'incentive', 'owner_salary', 'owner_incentive',
                      'rent', 'government', 'subscription', 'other')),
  -- Who the money went to (the employee for a salary).
  party_id          uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  -- NULL: paid by the company. A party: paid out of their own pocket, so the
  -- company owes them this amount until repaid.
  paid_by_party_id  uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  user_id           uuid NOT NULL DEFAULT auth.uid(),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_expenses_company_idx ON public.company_expenses (company_id, date);

-- ── company_expense_allocations: the part charged to a project ───────────
CREATE TABLE IF NOT EXISTS public.company_expense_allocations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id  uuid NOT NULL REFERENCES public.company_expenses(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  amount      numeric(14,2) NOT NULL CHECK (amount > 0),
  user_id     uuid NOT NULL DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (expense_id, project_id)
);
CREATE INDEX IF NOT EXISTS company_expense_allocations_project_idx ON public.company_expense_allocations (project_id);

-- ── intercompany_entries: advances and repayments between the company,
--    its projects and people ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.intercompany_entries (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  date               date NOT NULL,
  amount             numeric(14,2) NOT NULL CHECK (amount > 0),
  type               text NOT NULL CHECK (type IN ('advance', 'repayment')),
  from_kind          text NOT NULL CHECK (from_kind IN ('company', 'project', 'party')),
  from_id            uuid,
  to_kind            text NOT NULL CHECK (to_kind IN ('company', 'project', 'party')),
  to_id              uuid,
  note               text NOT NULL DEFAULT '',
  due_date           date,
  -- A repayment deducted from this salary.
  salary_expense_id  uuid REFERENCES public.company_expenses(id) ON DELETE SET NULL,
  user_id            uuid NOT NULL DEFAULT auth.uid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intercompany_company_has_no_id CHECK (
    (from_kind = 'company') = (from_id IS NULL) AND (to_kind = 'company') = (to_id IS NULL)),
  CONSTRAINT intercompany_two_sides CHECK (
    NOT (from_kind = to_kind AND from_id IS NOT DISTINCT FROM to_id))
);
CREATE INDEX IF NOT EXISTS intercompany_entries_company_idx ON public.intercompany_entries (company_id, date);

-- ── integrity: same company on every side, allocations within the amount ─
CREATE OR REPLACE FUNCTION public.company_ledger_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _company uuid;
  _total numeric;
  _amount numeric;
BEGIN
  IF TG_TABLE_NAME = 'company_expense_allocations' THEN
    SELECT company_id, amount INTO _company, _amount FROM company_expenses WHERE id = NEW.expense_id;
    IF NOT EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id AND company_id = _company) THEN
      RAISE EXCEPTION 'المشروع لا يتبع شركة هذا المصروف' USING ERRCODE = '23514';
    END IF;
    SELECT COALESCE(sum(amount), 0) INTO _total FROM company_expense_allocations
      WHERE expense_id = NEW.expense_id AND id <> NEW.id;
    IF _total + NEW.amount > _amount THEN
      RAISE EXCEPTION 'مجموع التحميل (%) يتجاوز مبلغ المصروف (%)', _total + NEW.amount, _amount USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'company_expenses' THEN
    IF NEW.party_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM parties WHERE id = NEW.party_id AND company_id = NEW.company_id)
       OR NEW.paid_by_party_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM parties WHERE id = NEW.paid_by_party_id AND company_id = NEW.company_id) THEN
      RAISE EXCEPTION 'الطرف لا يتبع هذه الشركة' USING ERRCODE = '23514';
    END IF;
    SELECT COALESCE(sum(amount), 0) INTO _total FROM company_expense_allocations WHERE expense_id = NEW.id;
    IF NEW.amount > 0 AND _total > NEW.amount THEN
      RAISE EXCEPTION 'المبلغ أقل من المحمَّل على المشاريع (%)', _total USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'intercompany_entries' THEN
    IF NEW.from_kind = 'project' AND NOT EXISTS (SELECT 1 FROM projects WHERE id = NEW.from_id AND company_id = NEW.company_id)
       OR NEW.to_kind = 'project' AND NOT EXISTS (SELECT 1 FROM projects WHERE id = NEW.to_id AND company_id = NEW.company_id)
       OR NEW.from_kind = 'party' AND NOT EXISTS (SELECT 1 FROM parties WHERE id = NEW.from_id AND company_id = NEW.company_id)
       OR NEW.to_kind = 'party' AND NOT EXISTS (SELECT 1 FROM parties WHERE id = NEW.to_id AND company_id = NEW.company_id) THEN
      RAISE EXCEPTION 'طرف الحركة لا يتبع هذه الشركة' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS company_ledger_check ON public.company_expense_allocations;
CREATE TRIGGER company_ledger_check BEFORE INSERT OR UPDATE ON public.company_expense_allocations
  FOR EACH ROW EXECUTE FUNCTION public.company_ledger_check();
DROP TRIGGER IF EXISTS company_ledger_check ON public.company_expenses;
CREATE TRIGGER company_ledger_check BEFORE INSERT OR UPDATE ON public.company_expenses
  FOR EACH ROW EXECUTE FUNCTION public.company_ledger_check();
DROP TRIGGER IF EXISTS company_ledger_check ON public.intercompany_entries;
CREATE TRIGGER company_ledger_check BEFORE INSERT OR UPDATE ON public.intercompany_entries
  FOR EACH ROW EXECUTE FUNCTION public.company_ledger_check();

REVOKE EXECUTE ON FUNCTION public.company_ledger_check() FROM PUBLIC, anon;

-- ── row-level security: the company scope ────────────────────────────────
ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_expense_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intercompany_entries ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['parties', 'company_expenses', 'intercompany_entries'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "View %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Insert %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Update %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Delete %1$s" ON public.%1$I', t);
    EXECUTE format($p$CREATE POLICY "View %1$s" ON public.%1$I FOR SELECT TO authenticated
      USING (public.has_access(auth.uid(), 'company'::public.scope_type, company_id))$p$, t);
    EXECUTE format($p$CREATE POLICY "Insert %1$s" ON public.%1$I FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid() AND public.can_edit(auth.uid(), 'company'::public.scope_type, company_id))$p$, t);
    EXECUTE format($p$CREATE POLICY "Update %1$s" ON public.%1$I FOR UPDATE TO authenticated
      USING (public.can_edit(auth.uid(), 'company'::public.scope_type, company_id))
      WITH CHECK (public.can_edit(auth.uid(), 'company'::public.scope_type, company_id))$p$, t);
    EXECUTE format($p$CREATE POLICY "Delete %1$s" ON public.%1$I FOR DELETE TO authenticated
      USING (public.can_edit(auth.uid(), 'company'::public.scope_type, company_id))$p$, t);
  END LOOP;
END $$;

-- Allocations take their company from the expense they belong to.
DROP POLICY IF EXISTS "View company_expense_allocations" ON public.company_expense_allocations;
DROP POLICY IF EXISTS "Insert company_expense_allocations" ON public.company_expense_allocations;
DROP POLICY IF EXISTS "Update company_expense_allocations" ON public.company_expense_allocations;
DROP POLICY IF EXISTS "Delete company_expense_allocations" ON public.company_expense_allocations;
CREATE POLICY "View company_expense_allocations" ON public.company_expense_allocations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.company_expenses e WHERE e.id = expense_id
                 AND public.has_access(auth.uid(), 'company'::public.scope_type, e.company_id)));
CREATE POLICY "Insert company_expense_allocations" ON public.company_expense_allocations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.company_expenses e WHERE e.id = expense_id
                 AND public.can_edit(auth.uid(), 'company'::public.scope_type, e.company_id)));
CREATE POLICY "Update company_expense_allocations" ON public.company_expense_allocations FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.company_expenses e WHERE e.id = expense_id
                 AND public.can_edit(auth.uid(), 'company'::public.scope_type, e.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.company_expenses e WHERE e.id = expense_id
                 AND public.can_edit(auth.uid(), 'company'::public.scope_type, e.company_id)));
CREATE POLICY "Delete company_expense_allocations" ON public.company_expense_allocations FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.company_expenses e WHERE e.id = expense_id
                 AND public.can_edit(auth.uid(), 'company'::public.scope_type, e.company_id)));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.parties, public.company_expenses,
  public.company_expense_allocations, public.intercompany_entries TO authenticated;
REVOKE ALL ON public.parties, public.company_expenses,
  public.company_expense_allocations, public.intercompany_entries FROM anon;

-- ── project placement: portfolio of the same company; moves between
--    companies need edit rights on both and a clean ledger ────────────────
-- Before this, nothing stopped a project pointing at another company's
-- portfolio, and since the 7 October policy reset a project-level editor
-- could change company_id to any company.
CREATE OR REPLACE FUNCTION public.project_placement_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.portfolio_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM portfolios WHERE id = NEW.portfolio_id AND company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'المحفظة لا تتبع شركة المشروع' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    IF auth.uid() IS NOT NULL AND NOT (
         can_edit(auth.uid(), 'company'::scope_type, OLD.company_id)
     AND can_edit(auth.uid(), 'company'::scope_type, NEW.company_id)) THEN
      RAISE EXCEPTION 'نقل المشروع بين الشركات يتطلب صلاحية تعديل على الشركتين' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM company_expense_allocations WHERE project_id = NEW.id)
       OR EXISTS (SELECT 1 FROM intercompany_entries WHERE (from_kind = 'project' AND from_id = NEW.id) OR (to_kind = 'project' AND to_id = NEW.id)) THEN
      RAISE EXCEPTION 'للمشروع تحميلات أو ذمم في دفتر شركته الحالية؛ احذفها أو سوِّها قبل النقل' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS project_placement_guard ON public.projects;
CREATE TRIGGER project_placement_guard BEFORE INSERT OR UPDATE OF company_id, portfolio_id ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.project_placement_guard();
REVOKE EXECUTE ON FUNCTION public.project_placement_guard() FROM PUBLIC, anon;

-- ── what the company charged to a project, readable by the project's team
--    without opening the company's own books ─────────────────────────────
CREATE OR REPLACE FUNCTION public.project_charged_costs(_project_id uuid)
RETURNS TABLE (allocation_id uuid, expense_id uuid, date date, kind text, description text, amount numeric, expense_amount numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- Runs as its owner, past the second_factor policy on the tables it reads:
  -- it asks the database's rule itself, as every definer function a user may
  -- call does since 20260926120000.
  SELECT public.require_second_factor();
  SELECT a.id, e.id, e.date, e.kind, e.description, a.amount, e.amount
    FROM company_expense_allocations a
    JOIN company_expenses e ON e.id = a.expense_id
   WHERE a.project_id = _project_id
     AND auth.uid() IS NOT NULL
     AND (has_access(auth.uid(), 'project'::scope_type, _project_id)
          OR has_access(auth.uid(), 'company'::scope_type, e.company_id))
   ORDER BY e.date DESC
$$;
REVOKE EXECUTE ON FUNCTION public.project_charged_costs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_charged_costs(uuid) TO authenticated;

-- ── the second factor, as on every table since 20260924150000 ────────────
-- Applied only where the second factor exists in the database; the owner
-- block's verification row reports which.
DO $$
BEGIN
  IF to_regprocedure('public.second_factor_ok()') IS NOT NULL THEN
    DROP POLICY IF EXISTS second_factor ON public.parties;
    EXECUTE 'CREATE POLICY second_factor ON public.parties AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.second_factor_ok())) WITH CHECK ((SELECT public.second_factor_ok()))';
    DROP POLICY IF EXISTS second_factor ON public.company_expenses;
    EXECUTE 'CREATE POLICY second_factor ON public.company_expenses AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.second_factor_ok())) WITH CHECK ((SELECT public.second_factor_ok()))';
    DROP POLICY IF EXISTS second_factor ON public.company_expense_allocations;
    EXECUTE 'CREATE POLICY second_factor ON public.company_expense_allocations AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.second_factor_ok())) WITH CHECK ((SELECT public.second_factor_ok()))';
    DROP POLICY IF EXISTS second_factor ON public.intercompany_entries;
    EXECUTE 'CREATE POLICY second_factor ON public.intercompany_entries AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.second_factor_ok())) WITH CHECK ((SELECT public.second_factor_ok()))';
  END IF;
END $$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261016120000', 'company_ledger')
ON CONFLICT (version) DO NOTHING;

SELECT CASE
  WHEN missing = '' THEN '✅ ready — 4 tables, RLS, guards, project costs function, ledger recorded'
    || CASE WHEN to_regprocedure('public.second_factor_ok()') IS NULL THEN ' (second factor not live here: no policy to add)' ELSE ', second factor on' END
  ELSE '❌ missing: ' || missing END AS company_ledger
FROM (
  SELECT concat_ws(', ',
    CASE WHEN to_regclass('public.parties') IS NULL THEN 'parties' END,
    CASE WHEN to_regclass('public.company_expenses') IS NULL THEN 'company_expenses' END,
    CASE WHEN to_regclass('public.company_expense_allocations') IS NULL THEN 'company_expense_allocations' END,
    CASE WHEN to_regclass('public.intercompany_entries') IS NULL THEN 'intercompany_entries' END,
    CASE WHEN (SELECT count(*) FROM pg_class WHERE relname IN ('parties','company_expenses','company_expense_allocations','intercompany_entries') AND relrowsecurity) < 4 THEN 'RLS' END,
    CASE WHEN (SELECT count(*) FROM pg_trigger WHERE tgname = 'company_ledger_check') < 3 THEN 'integrity triggers' END,
    CASE WHEN NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'project_placement_guard') THEN 'project placement guard' END,
    CASE WHEN to_regprocedure('public.project_charged_costs(uuid)') IS NULL THEN 'project_charged_costs' END,
    CASE WHEN pg_get_functiondef(to_regprocedure('public.project_charged_costs(uuid)')) NOT ILIKE '%require_second_factor()%'
         THEN 'project_charged_costs second factor' END,
    (SELECT 'unguarded definer functions: ' || string_agg(p.proname, ' ')
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef AND p.prokind = 'f'
        AND p.prorettype <> 'trigger'::regtype
        AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
        AND p.proname NOT IN ('has_role', 'has_access', 'can_edit', 'can_access_expense_receipt',
                              'can_access_resource_receipt', 'second_factor_ok', 'second_factor_required',
                              'require_second_factor')
        AND CASE WHEN p.prokind = 'f' THEN pg_get_functiondef(p.oid) END NOT ILIKE '%require_second_factor()%'
     HAVING count(*) > 0),
    CASE WHEN to_regprocedure('public.second_factor_ok()') IS NOT NULL
          AND (SELECT count(*) FROM pg_policies WHERE policyname = 'second_factor' AND permissive = 'RESTRICTIVE'
                AND tablename IN ('parties','company_expenses','company_expense_allocations','intercompany_entries')) < 4
         THEN 'second-factor policies' END,
    CASE WHEN NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261016120000') THEN 'ledger row' END,
    (SELECT count(*) || ' existing project(s) in another company''s portfolio' FROM projects pr JOIN portfolios pf ON pf.id = pr.portfolio_id
      WHERE pf.company_id <> pr.company_id HAVING count(*) > 0)
  ) AS missing
) m;
