-- A company expense charged to a project that the project already paid from
-- its own spend: shown as charged, counted once.
--
-- Manzouma's administrative expenses (4,611) were paid by Dr Saleh from his
-- pocket; Albania repaid him from its fund, and those repayments are in
-- Albania's direct spend. Charging the expenses to Albania as well would
-- count them twice. settled_in_project marks such a share: the project's
-- page shows it under «محمَّل من المنظومة» and leaves it out of the full cost.

ALTER TABLE public.company_expense_allocations
  ADD COLUMN IF NOT EXISTS settled_in_project boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.company_expense_allocations.settled_in_project IS
  'The project already paid this share from its own spend; shown as charged, not added to its cost again.';

-- The project's team reads what was charged to it, now with the flag. The
-- return type changes, so the function is dropped and made again, still
-- asking for the second factor first.
DROP FUNCTION IF EXISTS public.project_charged_costs(uuid);
CREATE FUNCTION public.project_charged_costs(_project_id uuid)
RETURNS TABLE (allocation_id uuid, expense_id uuid, date date, kind text, description text, amount numeric,
               expense_amount numeric, settled_in_project boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- Runs as its owner, past the second_factor policy on the tables it reads:
  -- it asks the database's rule itself, as every definer function a user may
  -- call does since 20260926120000.
  SELECT public.require_second_factor();
  SELECT a.id, e.id, e.date, e.kind, e.description, a.amount, e.amount, a.settled_in_project
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

NOTIFY pgrst, 'reload schema';
