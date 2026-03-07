
-- Create enums
CREATE TYPE public.app_role AS ENUM ('admin', 'editor', 'viewer');
CREATE TYPE public.scope_type AS ENUM ('system', 'company', 'project');

-- Profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  scope_type scope_type NOT NULL DEFAULT 'system',
  scope_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role, scope_type, scope_id)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Invites table
CREATE TABLE public.user_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role app_role NOT NULL DEFAULT 'viewer',
  scope_type scope_type NOT NULL DEFAULT 'system',
  scope_id uuid,
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_invites ENABLE ROW LEVEL SECURITY;

-- Security definer: check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role AND scope_type = 'system'
  )
$$;

-- Security definer: check if user has access to a scope
CREATE OR REPLACE FUNCTION public.has_access(_user_id uuid, _scope_type scope_type, _scope_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
    AND (
      (role = 'admin' AND user_roles.scope_type = 'system')
      OR (user_roles.scope_type = _scope_type AND user_roles.scope_id = _scope_id)
      OR (
        _scope_type = 'project'::scope_type AND user_roles.scope_type = 'company'::scope_type
        AND user_roles.scope_id IN (SELECT company_id FROM public.projects WHERE id = _scope_id)
      )
    )
  )
$$;

-- Security definer: check if user can edit a scope
CREATE OR REPLACE FUNCTION public.can_edit(_user_id uuid, _scope_type scope_type, _scope_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
    AND role IN ('admin', 'editor')
    AND (
      (role = 'admin' AND user_roles.scope_type = 'system')
      OR (user_roles.scope_type = _scope_type AND user_roles.scope_id = _scope_id)
      OR (
        _scope_type = 'project'::scope_type AND user_roles.scope_type = 'company'::scope_type
        AND user_roles.scope_id IN (SELECT company_id FROM public.projects WHERE id = _scope_id)
      )
    )
  )
$$;

-- Auto-create profile on signup and assign roles from invites
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invite RECORD;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, status)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 'active')
  ON CONFLICT (id) DO NOTHING;

  FOR _invite IN SELECT * FROM public.user_invites WHERE email = NEW.email AND status = 'pending'
  LOOP
    INSERT INTO public.user_roles (user_id, role, scope_type, scope_id)
    VALUES (NEW.id, _invite.role, _invite.scope_type, _invite.scope_id)
    ON CONFLICT DO NOTHING;
    UPDATE public.user_invites SET status = 'accepted' WHERE id = _invite.id;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS: profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- RLS: user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS: user_invites
CREATE POLICY "Admins can manage invites" ON public.user_invites FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Update existing RLS: companies (owner OR has access)
DROP POLICY IF EXISTS "Users can manage own companies" ON public.companies;
CREATE POLICY "Users can view companies" ON public.companies FOR SELECT USING (
  auth.uid() = user_id OR public.has_access(auth.uid(), 'company'::scope_type, id)
);
CREATE POLICY "Editors can insert companies" ON public.companies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Editors can update companies" ON public.companies FOR UPDATE USING (
  auth.uid() = user_id OR public.can_edit(auth.uid(), 'company'::scope_type, id)
);
CREATE POLICY "Owners can delete companies" ON public.companies FOR DELETE USING (
  auth.uid() = user_id OR public.has_role(auth.uid(), 'admin')
);

-- Update existing RLS: portfolios
DROP POLICY IF EXISTS "Users can manage own portfolios" ON public.portfolios;
CREATE POLICY "Users can view portfolios" ON public.portfolios FOR SELECT USING (
  auth.uid() = user_id OR public.has_access(auth.uid(), 'company'::scope_type, company_id)
);
CREATE POLICY "Editors can insert portfolios" ON public.portfolios FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Editors can update portfolios" ON public.portfolios FOR UPDATE USING (
  auth.uid() = user_id OR public.can_edit(auth.uid(), 'company'::scope_type, company_id)
);
CREATE POLICY "Owners can delete portfolios" ON public.portfolios FOR DELETE USING (
  auth.uid() = user_id OR public.has_role(auth.uid(), 'admin')
);

-- Update existing RLS: projects
DROP POLICY IF EXISTS "Users can manage own projects" ON public.projects;
CREATE POLICY "Users can view projects" ON public.projects FOR SELECT USING (
  auth.uid() = user_id OR public.has_access(auth.uid(), 'project'::scope_type, id) OR public.has_access(auth.uid(), 'company'::scope_type, company_id)
);
CREATE POLICY "Editors can insert projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Editors can update projects" ON public.projects FOR UPDATE USING (
  auth.uid() = user_id OR public.can_edit(auth.uid(), 'project'::scope_type, id) OR public.can_edit(auth.uid(), 'company'::scope_type, company_id)
);
CREATE POLICY "Owners can delete projects" ON public.projects FOR DELETE USING (
  auth.uid() = user_id OR public.has_role(auth.uid(), 'admin')
);

-- Update existing RLS: budget_items
DROP POLICY IF EXISTS "Users can manage own budget_items" ON public.budget_items;
CREATE POLICY "Users can view budget_items" ON public.budget_items FOR SELECT USING (
  auth.uid() = user_id OR public.has_access(auth.uid(), 'project'::scope_type, project_id)
);
CREATE POLICY "Editors can insert budget_items" ON public.budget_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Editors can update budget_items" ON public.budget_items FOR UPDATE USING (
  auth.uid() = user_id OR public.can_edit(auth.uid(), 'project'::scope_type, project_id)
);
CREATE POLICY "Owners can delete budget_items" ON public.budget_items FOR DELETE USING (
  auth.uid() = user_id OR public.has_role(auth.uid(), 'admin')
);

-- Update existing RLS: expenses
DROP POLICY IF EXISTS "Users can manage own expenses" ON public.expenses;
CREATE POLICY "Users can view expenses" ON public.expenses FOR SELECT USING (
  auth.uid() = user_id OR public.has_access(auth.uid(), 'project'::scope_type, project_id)
);
CREATE POLICY "Editors can insert expenses" ON public.expenses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Editors can update expenses" ON public.expenses FOR UPDATE USING (
  auth.uid() = user_id OR public.can_edit(auth.uid(), 'project'::scope_type, project_id)
);
CREATE POLICY "Owners can delete expenses" ON public.expenses FOR DELETE USING (
  auth.uid() = user_id OR public.has_role(auth.uid(), 'admin')
);

-- Update existing RLS: revenues
DROP POLICY IF EXISTS "Users can manage own revenues" ON public.revenues;
CREATE POLICY "Users can view revenues" ON public.revenues FOR SELECT USING (
  auth.uid() = user_id OR public.has_access(auth.uid(), 'project'::scope_type, project_id)
);
CREATE POLICY "Editors can insert revenues" ON public.revenues FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Editors can update revenues" ON public.revenues FOR UPDATE USING (
  auth.uid() = user_id OR public.can_edit(auth.uid(), 'project'::scope_type, project_id)
);
CREATE POLICY "Owners can delete revenues" ON public.revenues FOR DELETE USING (
  auth.uid() = user_id OR public.has_role(auth.uid(), 'admin')
);

-- Insert current user as admin (profile + role)
INSERT INTO public.profiles (id, email, status)
SELECT id, email, 'active' FROM auth.users WHERE email = 'p.o.m2012@hotmail.com'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role, scope_type)
SELECT id, 'admin', 'system' FROM auth.users WHERE email = 'p.o.m2012@hotmail.com';
