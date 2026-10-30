-- ============================================================================
-- SightB · the company's resource registry (one-off, CLAUDE.md rule 4 exception)
--
-- Paste ALL of this into Lovable Cloud's SQL editor and run it once. Safe to
-- run again. The last statement returns ONE row: "✅ ready" or what is missing.
-- Source: supabase/migrations/20261027090000_resource_registry.sql
--
-- Adds to the registry (public.parties) the kind «جهة», a role and other
-- spellings; and lets an expense and a project resource point at a registry
-- entry. Changes no existing row: every link starts empty, and is made from
-- the company page («ربط الأسماء»), with the owner choosing.
-- ============================================================================
BEGIN;

ALTER TABLE public.parties DROP CONSTRAINT IF EXISTS parties_kind_check;
ALTER TABLE public.parties ADD CONSTRAINT parties_kind_check CHECK (kind IN ('person', 'owner', 'vendor', 'entity'));
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS party_id uuid REFERENCES public.parties(id) ON DELETE SET NULL;
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS party_id uuid REFERENCES public.parties(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS expenses_party_idx ON public.expenses (party_id) WHERE party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS resources_party_idx ON public.resources (party_id) WHERE party_id IS NOT NULL;

-- A project's rows may name only its own company's parties.
CREATE OR REPLACE FUNCTION public.party_in_project_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.party_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM parties pa JOIN projects pr ON pr.company_id = pa.company_id
        WHERE pa.id = NEW.party_id AND pr.id = NEW.project_id) THEN
    RAISE EXCEPTION 'هذا الطرف ليس من سجل شركة المشروع.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.party_in_project_company() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS expenses_party_in_company ON public.expenses;
CREATE TRIGGER expenses_party_in_company BEFORE INSERT OR UPDATE OF party_id, project_id ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.party_in_project_company();
DROP TRIGGER IF EXISTS resources_party_in_company ON public.resources;
CREATE TRIGGER resources_party_in_company BEFORE INSERT OR UPDATE OF party_id, project_id ON public.resources
  FOR EACH ROW EXECUTE FUNCTION public.party_in_project_company();


INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261027090000', 'resource_registry') ON CONFLICT (version) DO NOTHING;

NOTIFY pgrst, 'reload schema';
COMMIT;

SELECT CASE WHEN missing = '' THEN '✅ ready — registry: kinds person, owner, vendor, entity; role and aliases; expenses and resources can link to it'
  ELSE '❌ missing: ' || missing END AS resource_registry
FROM (
  SELECT concat_ws(', ',
    CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'parties' AND column_name = 'aliases') THEN 'parties.aliases' END,
    CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'parties' AND column_name = 'role') THEN 'parties.role' END,
    CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'party_id') THEN 'expenses.party_id' END,
    CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'resources' AND column_name = 'party_id') THEN 'resources.party_id' END,
    CASE WHEN pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = 'parties_kind_check' AND conrelid = 'public.parties'::regclass)) NOT LIKE '%entity%' THEN 'kind entity' END,
    CASE WHEN (SELECT count(*) FROM pg_trigger WHERE tgname IN ('expenses_party_in_company', 'resources_party_in_company')) <> 2 THEN 'company check on links' END,
    CASE WHEN has_function_privilege('authenticated', 'public.party_in_project_company()', 'EXECUTE') THEN 'trigger function callable by users' END,
    CASE WHEN NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261027090000') THEN 'ledger row' END
  ) AS missing
) m;
