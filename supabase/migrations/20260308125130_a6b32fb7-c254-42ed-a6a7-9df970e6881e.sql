
-- Restrict DELETE on companies, projects, portfolios to admin only
DROP POLICY IF EXISTS "Editors can delete companies" ON companies;
CREATE POLICY "Admins can delete companies" ON companies FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Editors can delete projects" ON projects;
CREATE POLICY "Admins can delete projects" ON projects FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Editors can delete portfolios" ON portfolios;
CREATE POLICY "Admins can delete portfolios" ON portfolios FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
