-- One registry of the company's people, vendors and entities, used by every
-- project instead of a free-text name per expense and a separate list of
-- resources per project.
--
-- The registry is public.parties (20261016120000), already scoped to the
-- company with its RLS and second-factor policies. This adds:
--   * kind 'entity' (جهة: a government body, an association) beside person,
--     owner and vendor;
--   * role, and aliases: other spellings the person goes by, so a name typed
--     on an expense can be matched to them;
--   * expenses.party_id: who the money went to;
--   * resources.party_id: the registry entry a project's resource stands for.
-- Both links are optional and keep the text they replace (vendor, name), so
-- nothing reads differently until a row is linked. A link to a party of
-- another company is refused.

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

NOTIFY pgrst, 'reload schema';
