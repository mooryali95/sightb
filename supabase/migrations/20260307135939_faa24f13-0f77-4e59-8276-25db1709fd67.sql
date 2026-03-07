
-- Audit log table to track all deletions
CREATE TABLE public.audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  action TEXT NOT NULL DEFAULT 'delete',
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  record_data JSONB NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Users can view audit logs for their own actions or projects they have access to
CREATE POLICY "Users can view audit logs" ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR (project_id IS NOT NULL AND public.has_access(auth.uid(), 'project'::scope_type, project_id))
  );

-- Users can insert their own audit logs
CREATE POLICY "Users can insert audit logs" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
