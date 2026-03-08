
-- Allow admins to delete companies
CREATE POLICY "Admins can delete companies"
ON public.companies
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add audit triggers for milestones and change_orders tables (if not already added)
-- Add audit trigger for companies delete
CREATE OR REPLACE TRIGGER audit_companies_delete
BEFORE DELETE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.audit_delete();

CREATE OR REPLACE TRIGGER audit_companies_update
BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.audit_update();

CREATE OR REPLACE TRIGGER audit_projects_delete
BEFORE DELETE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.audit_delete();

CREATE OR REPLACE TRIGGER audit_projects_update
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.audit_update();
