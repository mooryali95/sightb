CREATE POLICY "Editors can update baseline_items"
ON public.baseline_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM cost_baselines cb
    WHERE cb.id = baseline_items.baseline_id
    AND (cb.user_id = auth.uid() OR can_edit(auth.uid(), 'project'::scope_type, cb.project_id))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM cost_baselines cb
    WHERE cb.id = baseline_items.baseline_id
    AND (cb.user_id = auth.uid() OR can_edit(auth.uid(), 'project'::scope_type, cb.project_id))
  )
);