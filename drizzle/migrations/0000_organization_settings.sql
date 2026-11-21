CREATE TABLE IF NOT EXISTS public.organization_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE CHECK (singleton),
  default_tax_percent numeric(5,2) NOT NULL DEFAULT 15
    CHECK (default_tax_percent >= 0 AND default_tax_percent <= 100),
  default_currency text NOT NULL DEFAULT 'SAR'
    CHECK (default_currency IN ('SAR','USD','EUR','GBP','AED','KWD','BHD','QAR','OMR','JOD','EGP')),
  default_duration_months integer NOT NULL DEFAULT 4
    CHECK (default_duration_months BETWEEN 1 AND 120),
  default_retention_percent numeric(5,2) NOT NULL DEFAULT 0
    CHECK (default_retention_percent >= 0 AND default_retention_percent <= 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, UPDATE ON public.organization_settings TO authenticated;
GRANT ALL ON public.organization_settings TO service_role;

ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read organization settings" ON public.organization_settings;
CREATE POLICY "Members read organization settings" ON public.organization_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins update organization settings" ON public.organization_settings;
CREATE POLICY "Admins update organization settings" ON public.organization_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS second_factor ON public.organization_settings;
CREATE POLICY second_factor ON public.organization_settings AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.second_factor_ok())) WITH CHECK ((SELECT public.second_factor_ok()));

CREATE OR REPLACE FUNCTION public.organization_settings_stamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  NEW.singleton := true;
  NEW.id := OLD.id;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.organization_settings_stamp() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS organization_settings_stamp ON public.organization_settings;
CREATE TRIGGER organization_settings_stamp BEFORE UPDATE ON public.organization_settings
  FOR EACH ROW EXECUTE FUNCTION public.organization_settings_stamp();

DROP TRIGGER IF EXISTS organization_settings_audit_update ON public.organization_settings;
CREATE TRIGGER organization_settings_audit_update AFTER UPDATE ON public.organization_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_update();

INSERT INTO public.organization_settings (singleton) VALUES (true)
ON CONFLICT (singleton) DO NOTHING;