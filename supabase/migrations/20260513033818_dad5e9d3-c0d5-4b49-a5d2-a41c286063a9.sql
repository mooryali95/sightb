-- =========================================================
-- C1: budget_amendments — enforce project-scoped edit access
-- =========================================================
DROP POLICY IF EXISTS "Users can create their own budget amendments" ON public.budget_amendments;
DROP POLICY IF EXISTS "Users can update their own draft amendments" ON public.budget_amendments;
DROP POLICY IF EXISTS "Users can delete their own draft amendments" ON public.budget_amendments;
DROP POLICY IF EXISTS "Users can view their own budget amendments" ON public.budget_amendments;

CREATE POLICY "View budget amendments with project access"
ON public.budget_amendments
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.has_access(auth.uid(), 'project'::scope_type, project_id));

CREATE POLICY "Editors can create budget amendments"
ON public.budget_amendments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND public.can_edit(auth.uid(), 'project'::scope_type, project_id)
);

CREATE POLICY "Editors can update their own draft amendments"
ON public.budget_amendments
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  AND status = 'draft'
  AND public.can_edit(auth.uid(), 'project'::scope_type, project_id)
)
WITH CHECK (
  auth.uid() = user_id
  AND public.can_edit(auth.uid(), 'project'::scope_type, project_id)
);

CREATE POLICY "Editors can delete their own draft amendments"
ON public.budget_amendments
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  AND status = 'draft'
  AND public.can_edit(auth.uid(), 'project'::scope_type, project_id)
);

-- =========================================================
-- H3: resource_settlements — restrict NULL project_id visibility
-- =========================================================
DROP POLICY IF EXISTS "View resource settlements with project access" ON public.resource_settlements;

CREATE POLICY "View resource settlements with project access"
ON public.resource_settlements
FOR SELECT
TO authenticated
USING (
  (project_id IS NOT NULL AND public.has_access(auth.uid(), 'project'::scope_type, project_id))
  OR (project_id IS NULL AND auth.uid() = user_id)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- =========================================================
-- H2: expense-receipts storage — add UPDATE policy
-- =========================================================
DROP POLICY IF EXISTS "Users can update their own expense receipts" ON storage.objects;

CREATE POLICY "Users can update their own expense receipts"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'expense-receipts'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'expense-receipts'
  AND auth.uid()::text = (storage.foldername(name))[1]
);